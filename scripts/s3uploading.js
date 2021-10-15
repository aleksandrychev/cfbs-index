const shell = require("shelljs");
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const workdir = process.env.GITHUB_WORKSPACE;
const s3 = new AWS.S3({
    "AWS_ACCESS_KEY_ID": process.env.AWS_ACCESS_KEY_ID,
    "AWS_SECRET_ACCESS_KEY": process.env.AWS_SECRET_ACCESS_KEY
});
const tmp = `${workdir}/tmp`;
const readmeRegex = new RegExp('^readme((\.(org|md|rst)$)|$)', 'i'); // readme, readme.org, readme.md, readme.rst
const Bucket = process.env.BUCKET_NAME

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const modules = readJSON(`${workdir}/index.json`).modules;
const versions = readJSON(`${workdir}/versions.json`);

let commitMsg = ["Updated versions.json\n"];

let uploadQueue = [];

const exit = err => {
    console.error(`\x1b[31m${err}\x1b[0m`);
    process.exit(1);
}

const uploadFile = (file, s3path) => s3.upload({
    Bucket,
    Key: s3path,
    Body: fs.readFileSync(file),
    ACL: 'public-read'
}, (err, data) => {
    if (err) exit(`Error while uploading. Err.: ${err}`)
    if (data) console.log(`${data.Location} successfully uploaded`);
})

const createTMP = () => {
    shell.rm('-rf', tmp);
    shell.mkdir(tmp);
}
createTMP();

const exec = (command) => new Promise((resolve, reject) =>
     shell.exec(command, (exitCode, stdout, stderr) => (exitCode !== 0) ? reject(new Error(stderr)) : resolve(stdout))
);

const checkout = async (module) => {
    shell.cd(tmp);
    // GIT_TERMINAL_PROMPT=0 disables git clone prompting for credentials in case of private or non-existing repository
    await exec(`GIT_TERMINAL_PROMPT=0 git clone --no-checkout ${module.repo}`)
        .catch(e => exit(`Error occurred while ${module.repo} cloning. Err. ${e.message}`));
    shell.cd(path.basename(module.repo));

    await exec(`git checkout ${module.commit}`)
        .catch(e => exit(`Error occurred while ${module.repo} ${module.commit} checkout. Err. ${e.message}`));

    if (module.subdirectory && module.subdirectory.length > 0) {
        shell.cd(module.subdirectory);
    }
}

const createHashFromFile = filePath => new Promise(resolve => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', data => hash.update(data)).on('end', () => resolve(hash.digest('hex')));
});

const processArchive = async (name, module) => {
    const archiveBaseName  = `${module.commit}.tar.gz`;
    await exec(`git archive ${module.commit} --format tar.gz --output ${archiveBaseName}`)
        .catch(e => exit(`Error occurred while archiving ${name} module. Err. ${e.message}`));
    let hash = await createHashFromFile(`./${archiveBaseName}`);
    const s3path = `modules/${name}/${module.commit}.tar.gz`;
    uploadQueue.push({localPath: `${shell.pwd().toString()}/${module.commit}.tar.gz`, s3path});
    return {"archive_url": s3path, "archive_sha256": hash}
}

const processReadme = async (moduleName, module) => {
    let readme_url = null, readme_sha256 = null;
    for (const file of shell.ls('*')) {
        if (readmeRegex.test(file)) {
            readme_url = `modules/${moduleName}/${module.commit}${path.extname(file)}`;
            uploadQueue.push({localPath: `${shell.pwd().toString()}/${file}`, s3path: readme_url});
            readme_sha256 = await createHashFromFile(`./${file}`);
        }
    }
    return {readme_url, readme_sha256};
}

const processModules = async () => {
    for (const moduleName in modules) {
        const module = modules[moduleName];
        // skip if alias or version already exists
        if (
            module.hasOwnProperty('alias') ||
            (versions.hasOwnProperty(moduleName) && versions[moduleName].hasOwnProperty(module.version))
        ) continue;
if(moduleName != 'autorun') continue;
        if (!module.commit || module.commit.length == 0) {
            exit(`${moduleName} module does not have commit`);
            continue;
        }

        if (!versions.hasOwnProperty(moduleName)) {
            versions[moduleName] = {};
        }

        await checkout(module);
        const readme = await processReadme(moduleName, module);
        const archive = await processArchive(moduleName, module);

        versions[moduleName][module.version] = {
            "commit": module.commit,
            "timestamp": Date.now(),
            ...archive,
            ...readme
        };

        commitMsg.push(`- Added ${moduleName} ${module.version} version`);
    }
}

try {
    processModules().then(() => {
        if (uploadQueue.length == 0) return;

        uploadQueue.forEach(item => {
            uploadFile(item.localPath, item.s3path);
        })

        fs.writeFile(`${workdir}/versions.json`, JSON.stringify(versions, null, 2) + "\n", function (err) {
            if (err) exit(err);
        });

        fs.writeFile(`${workdir}/commitMsg.txt`, commitMsg.join("\n"), function (err) {
            if (err) exit(err);
        });
    })
} catch (e) {
    exit(e)
}

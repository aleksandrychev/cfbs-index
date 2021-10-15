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

const uploadFile = (file, s3path) => s3.upload({
    Bucket,
    Key: s3path,
    Body: fs.readFileSync(file),
    ACL: 'public-read'
}, (err, data) => {
    if (err) console.error("Error while uploading", err);
    if (data) console.log(`${data.Location} successfully uploaded`);
})

const createTMP = () => {
    shell.rm('-rf', tmp);
    shell.mkdir(tmp);
}
createTMP();

const checkout = (module) => {
    shell.exec(`git clone --no-checkout ${module.repo}`)
    shell.exec(`git checkout ${module.commit}`)
    const moduleDir = path.basename(module.repo) + '/' + (module.subdirectory || '');
    shell.cd(moduleDir);
}

const createHashFromFile = filePath => new Promise(resolve => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', data => hash.update(data)).on('end', () => resolve(hash.digest('hex')));
});

const processArchive = async (index, module) => {
    const archiveBaseName  = `${module.commit}.tar.gz`;
    shell.exec(`git archive --format tar.gz --output ${archiveBaseName} ${module.commit}`);
    let hash = await createHashFromFile(`./${archiveBaseName}`);
    const s3path = `modules/${index}/${module.commit}.tar.gz`;
    uploadFile(`./${module.commit}.tar.gz`, s3path);
    return {"archive_url": s3path, "archive_sha256": hash}
}

const processReadme = async (moduleName, module) => {
    let readme_url = null, readme_sha256 = null;
    for (const file of shell.ls('*')) {
        if (readmeRegex.test(file)) {
            readme_url = `modules/${moduleName}/${module.commit}${path.extname(file)}`;
            uploadFile(file, readme_url);
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

        if (!module.commit || module.commit.length == 0) {
            console.error(`${moduleName} module does not have commit`);
            continue;
        }

        shell.cd(tmp);
        checkout(module);

        if (!versions.hasOwnProperty(moduleName)) {
            versions[moduleName] = {};
        }

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
        fs.writeFile(`${workdir}/versions.json`, JSON.stringify(versions, null, 2) + "\n", function (err) {
            if (err) return console.error(err);
        });

        fs.writeFile(`${workdir}/commitMsg.txt`, commitMsg.join("\n"), function (err) {
            if (err) return console.error(err);
        });
    })
} catch (e) {
    console.error(e)
    process.exit(1)
}

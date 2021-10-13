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
const readmeRegex = new RegExp('(readme\.md|readme\.org)', 'i');
const Bucket = process.env.BUCKET_NAME
console.log(Bucket)

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const modules = readJSON(`${workdir}/index.json`).modules;
const versions = readJSON(`${workdir}/versions.json`);

let commitMsg = ["Updated versions.json \n"];

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
    shell.exec(`git clone ${module.repo}`)
    shell.exec(`git checkout ${module.commit}`)
    const moduleDir = path.basename(module.repo) + '/' + (module.subdirectory || '');
    shell.cd(moduleDir);
}

const createHashFromFile = filePath => new Promise(resolve => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', data => hash.update(data)).on('end', () => resolve(hash.digest('hex')));
});

const processArchive = async (index, module) => {
    shell.exec(`tar --exclude .git -czvf ${module.commit}.tar.gz ./`);
    let hash = await createHashFromFile(`./${module.commit}.tar.gz`);
    const s3path = `modules/${index}/${module.commit}.tar.gz`;
    uploadFile(`./${module.commit}.tar.gz`, s3path);
    return {"archive_url": s3path, "archive_sha256": hash}
}

const processReadme = async (moduleIndex, module) => {
    let readme_url = null, readme_sha256 = null;
    for (const file of shell.ls('*.{md,org}')) {
        if (readmeRegex.test(file)) {
            let s3ReadmePath = `modules/${moduleIndex}/${module.commit}${path.extname(file)}`;
            uploadFile(file, `modules/${moduleIndex}/${module.commit}${path.extname(file)}`);
            readme_url = s3ReadmePath;
            readme_sha256 = await createHashFromFile(`./${file}`);
        }
    }
    return {readme_url, readme_sha256};
}

const processModules = async () => {
    for (const moduleIndex in modules) {
        const module = modules[moduleIndex];
        // skip if alias or version already exists
        if (
            module.hasOwnProperty('alias') ||
            (versions.hasOwnProperty(moduleIndex) && versions[moduleIndex].hasOwnProperty(module.version))
        ) continue;

        shell.cd(tmp);
        checkout(module);

        if (!versions.hasOwnProperty(moduleIndex)) {
            versions[moduleIndex] = {};
        }

        const readme = await processReadme(moduleIndex, module);
        const archive = await processArchive(moduleIndex, module);

        versions[moduleIndex][module.version] = {
            "commit": module.commit,
            ...archive,
            ...readme
        };

        commitMsg.push(`- Added ${moduleIndex} ${module.version} version`);
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


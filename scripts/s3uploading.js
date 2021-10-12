const shell = require("shelljs");
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const workdir = process.env.GITHUB_WORKSPACE;
const s3 = new AWS.S3();
const tmp = shell.pwd().toString() + '/tmp';
const readmeRegex = new RegExp('(readme\.md|readme\.org)', 'i');

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const modules = readJSON(`${workdir}/index.json`).modules;
const versions = readJSON(`${workdir}/versions.json`);

let commitMsg = ["Updated versions.json \n"];

const uploadFile = (file, s3path) => s3.upload({
    Bucket: 'cfbs',
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
    const moduleDir = path.basename(module.repo) + '/' + (module.subdirectory || '');
    shell.cd(moduleDir);
    shell.exec(`git checkout ${module.commit}`)
    console.log(module.commit)
}

const createHashFromFile = filePath => new Promise(resolve => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', data => hash.update(data)).on('end', () => resolve(hash.digest('hex')));
});

const createArchive = async (index, version, commit) => {
    try {
        shell.exec(`tar --exclude .git -czvf ${commit}.tar.gz ./`);
        let hash = await createHashFromFile(`./${commit}.tar.gz`);
        return {path: `${commit}.tar.gz`, hash}
    } catch (e) {
        console.error(e)
    }
}

const processModules = async () => {
    for (const moduleIndex in modules) {
        const module = modules[moduleIndex];
        if (moduleIndex != 'autorun') continue;
        if (module.hasOwnProperty('alias') || (versions.hasOwnProperty(moduleIndex) && versions[moduleIndex].hasOwnProperty(module.version))) continue;

        shell.cd(tmp);
        checkout(module);

        if (!versions.hasOwnProperty(moduleIndex)) {
            versions[moduleIndex] = {};
        }

        shell.ls('*.{md,org}').forEach(function (file) {
            if (readmeRegex.test(file)) {
                let s3ReadmePath = `modules/${moduleIndex}/${module.commit}${path.extname(file)}`;
                uploadFile(file, `modules/${moduleIndex}/${module.commit}${path.extname(file)}`);
                versions[moduleIndex][module.version] = {readme: s3ReadmePath};
            }
        });

        const archive = await createArchive(moduleIndex, module.version, module.commit);

        uploadFile('./' + archive.path, `modules/${moduleIndex}/${archive.path}`);

        versions[moduleIndex][module.version] = {
            "hash_sha256": archive.hash,
            "commit": module.commit,
            "archive_url": `/${moduleIndex}/${module.commit}.tar.gz`
        };
        commitMsg.push(`- Added ${moduleIndex} ${module.version} version`)
    }
}

processModules().then(() => {
    fs.writeFile(`${workdir}/versions.json`, JSON.stringify(versions, null, 2), function (err) {
        if (err) return console.error(err);
    });

    if (commitMsg.length) {
        fs.writeFile(`${workdir}/commitMsg.txt`, commitMsg.join("\n") , function (err) {
            if (err) return console.error(err);
        });
    }
})

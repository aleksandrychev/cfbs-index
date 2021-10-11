module.exports = function (grunt) {
    const workdir = process.env.GITHUB_WORKSPACE;
    const index = grunt.file.readJSON(`${workdir}/index.json`);

    if (!index.hasOwnProperty('modules')) {
        grunt.log.error("index.json misses modules");
    }

    grunt.registerTask("versioning", async function () {
        try {
            const versions = grunt.file.readJSON(`${workdir}/versions.json`);
            Object.keys(index.modules).forEach(key => {
                const module = index.modules[key];
                if (!module.hasOwnProperty('alias')) {
                    if (!versions.hasOwnProperty(key)) {
                        versions[key] = {};
                    }
                    versions[key][module.version] = module.commit;
                }
            })
            grunt.file.write(`${workdir}/versions.json`, JSON.stringify(versions, null, 2));
        } catch (e) {
            grunt.log.error(e);
        }
    });



    const shell = require('shelljs');
    const path = require('path');
    const crypto = require('crypto');
    const fs = require('fs');
    const S3 = require('aws-sdk/clients/s3');

    const createHashFromFile = filePath => new Promise(resolve => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(filePath).on('data', data => hash.update(data)).on('end', () => resolve(hash.digest('hex')));
    });

    grunt.registerTask("upload", async function () {
        const done = this.async();
        const checksums = grunt.file.readJSON(`${workdir}/checksums.json`);
        const readmeRegex = new RegExp('(readme\.md|readme\.org)', 'i');

        const tmp = shell.pwd().toString() + '/tmp';
        shell.rm('-rf', tmp);
        shell.mkdir(tmp);


        for (const key of Object.keys(index.modules)) {
            const module = index.modules[key];
            if (!module.hasOwnProperty('alias')) {
                if (!checksums.hasOwnProperty(key)) {
                    checksums[key] = {};
                }
                // if no checksum then upload to S3 and create checksum
                if (!checksums[key].hasOwnProperty(module.commit)) {
                    shell.cd(tmp);
                    shell.exec(`git clone ${module.repo}`)
                    const moduleDir = path.basename(module.repo) + '/' + (module.subdirectory || '');
                    shell.cd(moduleDir);
                    shell.exec(`git checkout ${module.commit}`)

                    shell.ls('*.{md,org}').forEach(function (file) {
                        if (readmeRegex.test(file)) {
                            console.log(file, 222)
                        }
                    });

                    try {
                        shell.exec(`tar --exclude .git -czvf ${module.commit}.tar.gz ./`);
                        let hash = await createHashFromFile(`./${module.commit}.tar.gz`);
                        console.log(`The sha256 sum of ${module.commit}.tar.gz is: ${hash}`)
                        checksums[key][module.commit] = hash;
                    } catch (e) {
                        console.log(e)
                    }


                    // + download
                    // + calc checksum
                    // upload to S3
                    // + set check sum
                    // console.log(checksums)
                }
            }
        }

        grunt.file.write(`${workdir}/checksums.json`, JSON.stringify(checksums, null, 2));
        done();
    });
};

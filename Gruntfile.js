const shell = require("shelljs");
const path = require("path");
const md5File = require("md5-file");
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
    const md5File = require('md5-file')
    grunt.registerTask("upload", async function () {
        const checksums = grunt.file.readJSON(`${workdir}/checksums.json`);
        const tmp = shell.pwd().toString() + '/tmp';
        shell.mkdir(tmp);
        Object.keys(index.modules).forEach(key => {
            const module = index.modules[key];
            if (!module.hasOwnProperty('alias')) {
                if (!checksums.hasOwnProperty(key)) {
                    checksums[key] = {};
                }
                // if no checksum then upload to S3 and create checksum
                if (!checksums[key].hasOwnProperty(module.commit)) {
                    // if (key != 'autorun') return;
                    shell.cd(tmp);
                    shell.exec(`git clone ${module.repo}`)
                    const moduleDir = path.basename(module.repo) + '/' + (module.subdirectory || '');
                    shell.cd(moduleDir);
                    shell.exec(`git checkout ${module.commit}`)

                    shell.ls('*.{md,org}').forEach(function (file) {
                        // console.log(file)
                    });

                    try {
                        shell.exec(`tar -czvf ${module.commit}.tar.gz ${shell.pwd().toString()}`);
                        const hash = md5File.sync(`${module.commit}.tar.gz`)
                        console.log(`The MD5 sum of ${module.commit}.tar.gz is: ${hash}`)
                        checksums[key][module.commit] = hash;
                        grunt.file.write(`${workdir}/checksums.json`, JSON.stringify(checksums, null, 2));
                    } catch (e) {
                        console.log(e)
                    }

                    return;
                    // download
                    // calc checksum
                    // upload to S3
                    // set check sum
                    checksums[key][module.commit] = '';
                }
            }
        })
        grunt.file.write(`${workdir}/versions.json`, JSON.stringify(versions, null, 2));
    });
};

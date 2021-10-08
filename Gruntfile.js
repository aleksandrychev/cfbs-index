module.exports = function (grunt) {

    grunt.registerTask("versioning", async function () {
        try {
            const workdir = process.env.GITHUB_WORKSPACE;
            const index = grunt.file.readJSON(`${workdir}/index.json`);
            if (!index.hasOwnProperty('modules')) {
                grunt.log.error("index.json misses modules");
            }
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

    grunt.registerTask("upload", async function () {
        grunt.log.ok("Modules uploaded");
        const workdir = process.env.GITHUB_WORKSPACE;
        const index = grunt.file.readJSON(`${workdir}/index.json`);
        if (!index.hasOwnProperty('modules')) {
            grunt.log.error("index.json misses modules");
        }
    });
};

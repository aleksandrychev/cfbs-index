module.exports = function (grunt) {

    grunt.registerTask("versioning", async function () {
        grunt.log.ok("Modules uploaded");
        const workdir = process.env.GITHUB_WORKSPACE;
        const index = grunt.file.readJSON(`${workdir}/index.json`);
        if (!index.hasOwnProperty('modules')) {
            grunt.log.error("index.json misses modules");
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

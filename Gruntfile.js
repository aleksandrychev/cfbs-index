module.exports = function (grunt) {
    grunt.registerTask("upload", async function () {
        grunt.log.ok("Modules uploaded");
        console.log(process.env)
        grunt.log.ok(process.env)
    });
};

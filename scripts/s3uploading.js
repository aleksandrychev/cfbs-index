// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');


const s3 = new AWS.S3({region: 'eu-central-1'});

var uploadParams = {Bucket: 'cfbs', Key: 'modules/sample.txt', Body: 'hello world!',region: 'eu-central-1'};

s3.upload (uploadParams, function (err, data) {
    if (err) {
        console.log("Error", err);
    } if (data) {
        console.log("Upload Success", data.Location);
    }
});
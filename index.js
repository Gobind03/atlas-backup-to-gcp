const settings = require("./settings");
const AtlasBackup = require("./atlas_backup.class");
var targz = require('targz');

const { Storage } = require("@google-cloud/storage");

const storage = new Storage({ keyFilename: __dirname + "/" + settings.gcp_service_acc_key });
const bucket = storage.bucket(settings.gcp_bucket_name);


let atlas_backup = new AtlasBackup(settings.public_key,
    settings.private_key,
    settings.group_id,
    settings.cluster,
    settings.polling_time_ms);

atlas_backup.download_backups(settings.nSnapshots).then(function (success) {
    if (success)
        Promise.all(success).then(function (res) {
            console.log("Downloads Concluded. Initiating upload to GCP.")
            let uploadPromises = [];
            let compressionPromises = [];
            for (let itr = 0; itr < res.length; itr++) {
                compressionPromises.push(new Promise((resolve, reject) => {
                    targz.compress({
                        src: "backups/" + res[itr],
                        dest: res[itr] + '.tar.gz'
                    }, function () {
                        console.log('Compressed ' + res[itr]);
                        resolve(res[itr] + '.tar.gz')
                    })
                }));
                uploadPromises.push(new Promise((resolve, reject) => {
                    console.log("Starting Upload for " + res[itr] + " to GCP");
                    bucket.upload(res[itr] + '.tar.gz', {
                        destination: res[itr],
                        metadata: {
                            metadata: {
                                TS: Date.now()
                            }
                        }
                    })
                        .then(() => {
                            console.log("Successfully Uploaded " + res[itr] + " to GCP");
                            resolve(res[itr]);
                        })
                        .catch((err) => reject(err));
                }))
            }
            Promise.all(compressionPromises).then(function (comPressionResponse) {
                Promise.all(uploadPromises).then((res) => {
                    console.log("Backup Transfer Concluded");
                })
                    .catch((err) => console.error(err))
            })

        });
});
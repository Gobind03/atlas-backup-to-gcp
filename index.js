const settings = require("./settings");
const AtlasBackup = require("./atlas_backup.class");
const { Storage } = require("@google-cloud/storage");

const storage = new Storage({ keyFilename: __dirname + "/" + settings.gcp_service_acc_key });
const bucket = storage.bucket(settings.gcp_bucket_name);


let atlas_backup = new AtlasBackup(settings.public_key,
    settings.private_key,
    settings.group_id,
    settings.cluster);

atlas_backup.download_backups(settings.nSnapshots).then(function (success) {
    if (success)
        Promise.all(success).then(function (res) {
            let uploadPromises = [];
            for (let itr = 0; itr < res.length; itr++) {
                uploadPromises.push(new Promise((resolve, reject) => {
                    bucket.upload("backups/" + res[itr])
                        .then(() => {
                            console.log("Successfully Uploaded " + res[itr] + " to GCP");
                            resolve(res[itr]);
                        })
                        .catch((err) => reject(err));
                }))
            }
            Promise.all(uploadPromises).then((res) => {
                console.log("Backup Transfer Concluded");
            })
                .catch((err) => console.error(err))
        });
});
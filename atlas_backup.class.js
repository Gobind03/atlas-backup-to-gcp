const http = require('https');
const fs = require("fs");
const AxiosDigestAuth = require("@mhoc/axios-digest-auth").default;


class AtlasBackup {
    constructor(public_key, private_key, project, cluster, polling_time_ms) {
        this.project = project;
        this.cluster = cluster;
        this.digestAuth = new AxiosDigestAuth({
            username: public_key,
            password: private_key,
        });
        this.polling_time_ms = polling_time_ms;
    }

    // Function to Get The List of Backups
    async get_snapshots() {
        console.log("Fetching the list of available snapshots on Atlas.");
        let url = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${this.project}/clusters/${this.cluster}/backup/snapshots`;
        const response = await this.digestAuth.request({
            headers: { Accept: "application/json" },
            method: "GET",
            url: url,
        });
        return response;
    }

    // Create Download Jobs for Last nSnapshot snapshots
    // If a job is already created then get the jobId for it 
    // Returns the Array of JobIDs created
    async create_download_jobs(nSnapshots) {
        console.log("Initiating download job creation process.")
        let snapshots = await this.get_snapshots();
        let jobs = [];
        for (let itr = 0; (itr < snapshots.data.results.length && itr < nSnapshots); itr++) {
            let job = await this.create_download_job(snapshots.data.results[itr].id);
            jobs.push(job.data.id);
        }
        return jobs;
    }

    // Create a Download Job in Atlas
    async create_download_job(snapshot_id) {
        console.log("Creating download URL creation job for snapshot ID: " + snapshot_id);
        let url = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${this.project}/clusters/${this.cluster}/backup/restoreJobs/`;
        try {
            const response = await this.digestAuth.request({
                headers: { Accept: "application/json" },
                method: "POST",
                url: url,
                data: {
                    "deliveryType": "download",
                    "snapshotId": snapshot_id
                }
            });
            return response;
        } catch (e) {
            if (e.response.data.errorCode == "CANNOT_DOWNLOAD_SNAPSHOT_CONCURRENTLY") {
                let job = await this.get_job_id(snapshot_id);
                return {
                    data: job
                };
            }
            else
                throw e;
        }
    }

    // Get Job ID for an existing Snaphot ID
    async get_job_id(snapshot_id) {
        let url = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${this.project}/clusters/${this.cluster}/backup/restoreJobs/`;
        const response = await this.digestAuth.request({
            headers: { Accept: "application/json" },
            method: "GET",
            url: url,
        });

        let job = null;
        for (let itr = 0; itr < response.data.results.length; itr++) {
            if (response.data.results[itr].snapshotId == snapshot_id) {
                job = response.data.results[itr];
                break;
            }
        }
        return job;
    }

    // Get Status of a current submitted job
    // Returns False if Job is yet not done
    async get_job_status(job_id) {
        console.log("Checking status for Job ID: " + job_id);
        let url = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${this.project}/clusters/${this.cluster}/backup/restoreJobs/${job_id}`;
        const response = await this.digestAuth.request({
            headers: { Accept: "application/json" },
            method: "GET",
            url: url,
        });

        if (response.data.cancelled == false
            && response.data.failed == false
            && response.data.expired == false
            && response.data.deliveryUrl.length == 0) {
            console.log("Job ID " + job_id + " has not yet concluded. Pushing for re-poll.");
            return false;
        }
        else {
            console.log("Job ID " + job_id + " has concluded. Concluding polling process for this.");
            return response.data;
        }
    }

    // Generate Download URLs by Polling Jobs
    async get_download_urls(nSnapshots) {
        console.log("Initiating Polling ...")
        let jobs = await this.create_download_jobs(nSnapshots);
        let successfulDownloads = [];
        while (jobs.length != 0) {
            console.log("Starting polling event ...");
            for (let itr = 0; itr < jobs.length; itr++) {
                console.log("Polling Job " + jobs[itr]);
                let status = await this.get_job_status(jobs[itr]);
                if (status) {
                    successfulDownloads.push(status);
                    jobs.splice(itr, 1);
                }
            }
            console.log("Ending polling event. Sleeping ...");
            await this.#sleep(this.polling_time_ms);
        }
        console.log("Polling Done ...")
        return successfulDownloads;
    }

    // Download Files
    async download_backups(nSnapshots) {
        let urls = await this.get_download_urls(nSnapshots);
        console.log("Starting Downloads ...")
        let promises = [];
        var dir = './backups';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        for (let itr = 0; itr < urls.length; itr++) {
            console.log("Initiating Download for Job ID: " + urls[itr].id);
            let backup_dir = dir + "/" + urls[itr].timestamp.replace(":", "");
            if (!fs.existsSync(backup_dir)) {
                fs.mkdirSync(backup_dir);
            }
            for (let itr2 = 0; itr2 < urls[itr].components.length; itr2++) {
                console.log("Initiating Download for " + urls[itr].components[itr2].replicaSetName
                    + "in " + urls[itr].id);
                let file = fs.createWriteStream(backup_dir + "/" +
                    urls[itr].components[itr2].replicaSetName + ".tar.gz");
                promises.push(new Promise((resolve, reject) => {
                    http.get(urls[itr].components[itr2].downloadUrl,
                        function (response) {
                            response.pipe(file);
                            file.on("finish", () => {
                                file.close();
                                console.log("Concluded Download for " + urls[itr].components[itr2].replicaSetName
                                    + "in " + urls[itr].id);
                                resolve(urls[itr].timestamp.replace(":", ""));
                            });
                        })
                })
                );
            }
        }
        return promises;
    }

    async #sleep(mSec) {
        return new Promise(res => setTimeout(res, mSec));
    }
}

module.exports = AtlasBackup;
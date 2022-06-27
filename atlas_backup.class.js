const http = require('https');
const fs = require("fs");
const AxiosDigestAuth = require("@mhoc/axios-digest-auth").default;


class AtlasBackup {
    constructor(public_key, private_key, project, cluster) {
        this.project = project;
        this.cluster = cluster;
        this.digestAuth = new AxiosDigestAuth({
            username: public_key,
            password: private_key,
        });
    }

    // Function to Get The List of Backups
    async get_snapshots() {
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
        let snapshots = await this.get_snapshots();
        let jobs = [];
        for (let itr = 0; (itr < snapshots.data.results.length && itr < nSnapshots); itr++) {
            let job = await this.create_download_job(snapshots.data.results[itr].members[0].id);
            jobs.push(job.data.id);
        }
        return jobs;
    }

    // Create a Download Job in Atlas
    async create_download_job(snapshot_id) {
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
            return false;
        }
        else {
            return response.data;
        }
    }

    // Generate Download URLs by Polling Jobs
    async get_download_urls(nSnapshots) {
        let jobs = await this.create_download_jobs(nSnapshots);
        let successfulDownloads = [];
        while (jobs.length != 0) {
            for (let itr = 0; itr < jobs.length; itr++) {
                let status = await this.get_job_status(jobs[itr]);
                if (status) {
                    successfulDownloads.push(status);
                    jobs.splice(itr, 1);
                }
            }
            this.#privateStaticMethod(5000);
        }
        return successfulDownloads;
    }

    // Download Files
    async download_backups(nSnapshots) {
        let urls = await this.get_download_urls(nSnapshots);
        let promises = [];
        for (let itr = 0; itr < urls.length; itr++) {
            let file = fs.createWriteStream("backups/" + urls[itr].id + ".tar.gz");
            promises.push(new Promise((resolve, reject) => {
                http.get(urls[itr].deliveryUrl[0],
                    function (response) {
                        response.pipe(file);
                        file.on("finish", () => {
                            file.close();
                            console.log("Download Completed for " + urls[itr].id);
                            resolve(urls[itr].id + ".tar.gz");
                        });
                    })
            })
            );
        }
        return promises;
    }

    async #privateStaticMethod(mSec) {
        new Promise(res => setTimeout(res, mSec));
    }
}

module.exports = AtlasBackup;
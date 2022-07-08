# MongoDB Atlas To GCP Transfer 
A module that downloads snapshots from MongoDB Sharded Clusters hosted on Atlas and Uploads them to GCP. 

## How to run 
1. Creating a `settings.js` by copying contents from `settings.example.js`
2. Assign appropriate values to the keys
3. Execute `npm install` if you are running the code for the first time
4. Execute the script by running `npm start`


## Configuration / Setting Parameters
1. `group_id`: Atlas Project ID
2. `cluster`: Name of the cluster in the project mentioned in `group_id`
3. `public_key`: Atlas Project Public Key
4. `private_key`: Atlas Project Private Key 
5. `nSnapshots`: decides the latest `n` snapshots to be transferred
6. `gcp_bucket_name`: GCP Cloud Storage Bucket name to which backup has to be trasferred to
7. `gcp_service_acc_key`: Service Account JSON key that has write/read access to the bucket
8. `polling_time_ms`: Polling interval in millis

#!/bin/bash

# Create backups directory if it doesn't exist
mkdir backups

# Export the databasee
litefs export --name sqlite.db --url http://e2866454b1d048.vm.yawp-school.internal:20202 backups/$(date +%m-%d-%Y).db

# Compress the backup
gzip backups/$(date +%m-%d-%Y).db

# Upload to S3
aws s3 cp backups/$(date +%m-%d-%Y).db.gz s3://yawp-school --endpoint-url https://fly.storage.tigris.dev

# Clean up
rm -rf backups

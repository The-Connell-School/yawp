#!/bin/bash

# Create backups directory if it doesn't exist
mkdir backups

# Export the databasee
litefs export --name sqlite.db --url http://e2866454b1d048.vm.yawp-school.internal:20202 backups/$(date +%m-%d-%Y).db

# Compress the backup
gzip backups/$(date +%m-%d-%Y).db

# Upload to S3
aws s3 cp backups/$(date +%m-%d-%Y).db.gz s3://yawp-school --endpoint-url https://fly.storage.tigris.dev

# Remove backups older than 10 days
aws s3 ls s3://ploductivity --endpoint-url https://fly.storage.tigris.dev | awk '{print $4}' | while read -r file; do
    file_date=$(echo "$file" | grep -oP '\d{2}-\d{2}-\d{4}')
    if [[ ! -z "$file_date" ]]; then
        file_timestamp=$(date -d "$file_date" +%s)
        current_timestamp=$(date +%s)
        age_days=$(( (current_timestamp - file_timestamp) / 86400 ))
        if [[ $age_days -ge 10 ]]; then
            aws s3 rm s3://ploductivity/"$file" --endpoint-url https://fly.storage.tigris.dev
        fi
    fi
done

# Clean up
rm -rf backups

#!/bin/bash

# Setup variables
bucket="yawp-school"
db_url="http://e2866454b1d048.vm.yawp-school.internal:20202"
s3_endpoint="https://fly.storage.tigris.dev"
backup_file="$(date +%m-%d-%Y_%H-%M-%S).db"

# Save a backup
mkdir backups
litefs export --name sqlite.db --url "$db_url" "backups/$backup_file"
gzip "backups/$backup_file"
aws s3 cp "backups/$backup_file.gz" s3://"$bucket" --endpoint-url "$s3_endpoint"
rm -rf backups

# Remove backups older than 10 days
aws s3 ls s3://"$bucket" --endpoint-url "$s3_endpoint" | awk '{print $4}' | while read -r file; do
    file_date=$(echo "$file" | grep -oP '\d{2}-\d{2}-\d{4}')
    if [[ ! -z "$file_date" ]]; then
        current_date=$(date +%Y-%m-%d)
        file_date_formatted=$(date -d "${file_date//-//}" +%Y-%m-%d 2>/dev/null)
        if [[ $? -eq 0 && "$file_date_formatted" < "$current_date" ]]; then
            days_diff=$(( ($(date -d "$current_date" +%s) - $(date -d "$file_date_formatted" +%s)) / 86400 ))
            if [[ $days_diff -ge 10 ]]; then
                aws s3 rm s3://"$bucket"/"$file" --endpoint-url "$s3_endpoint"
                echo "Deleted: $file"
            fi
        fi
    fi
done

#!/bin/bash

while true; do
  echo "Starting backup process..."

  # Export the database
  litefs export -name sqlite.db /tmp/backup
  echo "Database exported"

  # Compress the backup
  gzip /tmp/backup
  echo "Backup compressed"

  # Upload to S3
  timestamp=$(date +%Y%m%d%H%M%S)
  aws s3 cp /tmp/backup.gz s3://your-bucket-name/backup-$timestamp.gz
  echo "Backup uploaded to S3"

  # Clean up
  rm /tmp/backup.gz
  echo "Temporary files cleaned up"

  echo "Backup process completed successfully"

  # Wait 24 hours before the next backup
  sleep 86400
done

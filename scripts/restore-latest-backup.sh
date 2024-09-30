#!/bin/bash

MACHINE_ID=$FLY_ALLOC_ID
APP_NAME=$FLY_APP_NAME

# Get the latest backup file from S3
LATEST_BACKUP=$(aws s3 ls s3://yawp-school --endpoint-url https://fly.storage.tigris.dev | sort | tail -n 1 | awk '{print $4}')

# Download the latest backup
aws s3 cp s3://yawp-school/$LATEST_BACKUP restored.db.gz --endpoint-url https://fly.storage.tigris.dev

# Decompress the backup
gunzip restored.db.gz

# Import the backup
litefs import --name sqlite.db --url http://$MACHINE_ID.vm.$APP_NAME.internal:20202 restored.db

# Clean up
rm restored.db

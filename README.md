# Yawp!

A software product to help students of The Connell School interact with GPTs
built in OpenAI.

### Getting started

1. Get .env file
2. Install dependencies w/ `npm install`

## Backup/restore the database
1. Create a bucket in console.tigris.dev with yawp-school as the bucket name
2. Run a backup with the commands below

```bash
fly ssh console -a yawp-school
> rm -rf backups && mkdir backups
> litefs export --name sqlite.db backups/mm-dd-yyyy.db
> gzip backups/mm-dd-yyyy.db
> aws -v
> apt-get update && apt-get install -y curl unzip && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && ./aws/install
> aws configure
> aws s3 cp backups/mm-dd-yyyy.db s3://yawp-school --endpoint-url https://fly.storage.tigris.dev
```

3. To restore a database, find the date you want to restore back to and run the commands below

```bash
fly ssh console -a yawp-school
> aws -v
> apt-get update && apt-get install -y curl unzip && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && ./aws/install
> aws configure
> aws s3 cp s3://yawp-school/mm-dd-yyyy.db.gz restored.db.gz --endpoint-url https://fly.storage.tigris.dev
> gunzip restored.db.gz
> litefs import --name sqlite.db restored.db
```

# Troubleshooting

## Rollback (oops!)

```bash
fly deploy -i `fly releases -j | jq ".[1].ImageRef" -r`
```

Run `fly releases --image` to see the latest images released if you need to
cherry-pick. Only code changes will create a new image (setting or removing
secrets won't create a new image, etc.)

## Resetting the staging site

1. Change the `fly.toml > name` to the staging site (`yawp-school-staging`)

2. Delete existing volume

```bash
fly scale count 0
fly vol list
fly vol destroy vol_<id_of_first_listed_volume_above>
fly scale count 1
```

3. Run the following commands First ssh into the app console before running this
   commands.

```bash
fly ssh console
```

```bash
apt-get update && \
apt-get install curl unzip && \
curl -fsSL https://releases.hashicorp.com/consul/1.10.0/consul_1.10.0_linux_amd64.zip -o consul.zip && \
unzip consul.zip -d /usr/local/bin/ && \
rm consul.zip
```

```bash
export TOKEN=$(echo $FLY_CONSUL_URL | sed -n 's|https://:\([^@]*\)@.*|\1|p'); \
export HOST=$(echo $FLY_CONSUL_URL | sed -n 's|https://:[^@]*@\([^/]*\)/.*|\1|p'); \
export PREFIX=$(echo $FLY_CONSUL_URL | sed -n 's|https://[^@]*@[^/]*/\([^/]*\).*|\1|p'); \
export LITEFS_CONSUL_KEY='epic-stack-litefs/yawp-school-staging'
```

```bash
consul kv delete -http-addr=https://$HOST -token=$TOKEN $PREFIX/$LITEFS_CONSUL_KEY/clusterid
```

4. Re-deploy staging

```bash
mv ./other/Dockerfile Dockerfile && \
mv ./other/.dockerignore .dockerignore && \
fly deploy && \
mv ./Dockerfile ./other/Dockerfile && \
mv ./.dockerignore ./other/.dockerignore
```

5. Seed the staging site Visit
   https://staging.yawp.school/api/seed?mode=preview&token=staging-seed-ict.
   This will seed the staging site with preview data.

6. Change the `fly.toml > name` back to the production site (`yawp-school`)

## Recovering from a backup

To recover from the latest backup, run the following command:

```bash
litefs import -name sqlite.db /tmp/backup.gz s3://your-bucket-name/backup-latest.gz
```

This will import the latest backup from S3 and restore the SQLite database.

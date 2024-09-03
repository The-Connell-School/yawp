# Yawp!

A software product to help students of The Connell School interact with GPTs
built in OpenAI.

### Getting started

1. Get .env file
2. Install dependencies w/ `bun install`

# Database Troubleshooting

## Backups

All backups are automated (if the aws variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` are in github action secrets).
They will happen daily.

## Restore

To restore the latest database in case of emergency, run the following commands:

```
fly ssh console -C "./scripts/restore-latest-backup.sh"
```

# Code Troubleshooting

## Code Rollback (oops!)

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

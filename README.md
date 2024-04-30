# Yawp!

A software product to help students of The Connell School interact with GPTs
built in OpenAI.

### Getting started

1. Get .env file
2. Install dependencies w/ `npm install`

# Troubleshooting

## Resetting a SQLite database

1. Delete existing volume

```bash
fly scale count 0
fly vol destroy vol_some-long-id
fly scale count 1
```

2. Fix the consule error messages in your logs Follow this guide
   (https://fly.io/docs/litefs/disaster-recovery/#cleaner-option-remove-the-wrong-key-from-consul)
   for cleaning the consul key & restarting the app. You will need to run the
   below commands to install consul as the suggested way (via `apt-get` and
   `apk` don't work):

```bash
apt-get update && \
apt-get install curl unzip && \
curl -fsSL https://releases.hashicorp.com/consul/1.10.0/consul_1.10.0_linux_amd64.zip -o consul.zip && \
unzip consul.zip -d /usr/local/bin/ && \
rm consul.zip
```

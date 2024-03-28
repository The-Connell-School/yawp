# Yawp!

A software product to help students of The Connell School interact with GPTs
built in OpenAI.

### Problem

ChatGPT "My GPTs" are a cool feature, allowing you to tailor your own GPT to be
"specialized" in a certain domain. You give it documents and additional
instructions and it gives you a GPT that is really good at what you trained it
to be good at. However, it's expensive to actually use, especially if you have
many people you want to show it to. Everyone would have to have a ChatGPT
account, which starts @ $20/month (if you can even get in the waitlist).

### Solution

OpenAI has a way to interact with those "My GPTs" (using the powerful GPT4
model) via an API. All you need is an interface to interact with it. That's what
this is - a way for The Connell School to put their "My GPTs" in front of their
many students at a fraction of the cost.

# Troubleshooting

## Resetting a SQLite database

1. Delete existing volume

```bash
fly scale count 0
fly vol destroy vol_some-long-id
fly sale count 1
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

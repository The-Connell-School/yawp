### Shortcuts

1. Docker build: `bun web-app:docker:build --build-arg DATABASE_URL=postgresql://postgres:postgres@localhost:5432/yawp`


### Using the Bastion Host

1. Generate an SSH key pair if you haven't already:
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/yawp-{env}-bastion
```
2. Get the public key value
```bash
cat ~/.ssh/yawp-{env}-bastion.pub
```
3. Add the public key value to your Terraform variables (in your envs/prod.tfvars or similar):
```txt
bastion_public_key = "ssh-rsa AAAA..." # Your public key content
```
4. Apply your changes and get your bastion public ip
```bash
terraform apply && terraform output bastion_public_ip
```
5. You can connect to your RDS instance through the bastion:
```bash
ssh -i ~/.ssh/yawp-{env}-bastion ubuntu@<bastion-public-ip>
```

# yawp-2.0

### Setting Up Checklist

- [ ] Configure the backend on s3 (replace vars, only 1 per app {not per env})
```bash
aws s3api create-bucket \
  --bucket <app_name>-tf-state \
  --region us-east-2 \
  --create-bucket-configuration LocationConstraint=us-east-2

aws s3api put-bucket-versioning --bucket <app_name>-tf-state --versioning-configuration Status=Enabled
```
- [ ] Create a variables file (in infra/envs/variables), e.g. infra/envs/variables/<env>.tfvars
- [ ] Run `bun infra:<env>:apply` (the app runner will fail, needs an image)
- [ ] Build, tag, and push a new web app docker image
- [ ] Delete the first app runner from the AWS console (when if fails to create, it doesn't pick up new ecr pushes)
- [ ] Re-run `bun infra:<env>:apply`

### Connecting to the Bastion Host

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
ssh -i ~/.ssh/yawp-{env}-bastion ec2-user@<bastion-public-ip>
```

### Connecting to an AWS database from a .ts script

1. Open a tunnel to the db
```bash
ssh -N -L 3306:<db_host>:5432 ec2-user@<bastion_server_host> -i ~/.ssh/<app_name>-<env>-bastion
```
2. Then, in another terminal, connect to the database (using actual creds)
```bash
DATABASE_URL="postgresql://<user>:<password>@localhost:3306/<db_name>"
```

### Creating a database backup from production
First login to the ssh server:
```
ssh ec2-user@3.87.160.232 -i ~/.ssh/yawp-production-bastion

```
On the ssh server, install the `pg_dump` command via postgresql tools and dump the database to a file:
```
sudo yum install postgresql15
pg_dump --host=yawp-production-postgres.cafmse4qcmw7.us-east-1.rds.amazonaws.com --port=5432 --username=yawp_admin --dbname=yawpdb --file=backup.dump
exit
```
Now that you are back on your local machine, copy the file over:
```
scp -i ~/.ssh/yawp-production-bastion ec2-user@3.87.160.232:/home/ec2-user/backup.dump .
```

# Demo training media

This independent Terraform root adds private demo storage in account
`422348803522`, `us-east-1`. It does not use the production Terraform root,
variables, or state. The existing demo host is `i-0b036db1dad5d3680`, with
instance profile `yawp-demo` and role `yawp-demo-role`. That role is provisioned
by `scripts/preview/guard-demo-backup-iam.sh`, dispatched manually through
`Demo backup IAM guard`; host setup is documented in `docs/runbooks/preview.md`.
There is no existing demo-host Terraform workspace to extend.

This root uses the existing preview state bucket
`422348803522-yawp-terraform-preview-state`, the new isolated key
`yawp/demo/training-media/terraform.tfstate`, and workspace `default`.
The infrastructure operator uses the existing `yawp` AWS profile. No application
keys or secret values are required. CI/deploy workflows do not apply this root.

Prepare a reviewable plan (keep local Terraform files under your temporary directory):

```bash
export TF_DATA_DIR="$TMPDIR/demo-training-media-terraform"
AWS_PROFILE=yawp terraform -chdir=infra/demo-training-media init -input=false
AWS_PROFILE=yawp terraform -chdir=infra/demo-training-media test
AWS_PROFILE=yawp terraform -chdir=infra/demo-training-media plan -input=false -lock=false
```

The expected initial plan is **10 additions, zero changes, zero destructions**.
Only a new inline `sts:AssumeRole` policy is added to the existing demo host role;
its backup, certificate, image, and metrics policies are preserved. All media
permissions belong to a new role and cover only `teacher-trainings/*` in the new
bucket. S3 authorizes create, upload-part, and completion with `s3:PutObject`.
The application does not call ListParts, so no listing permission is granted.

After a separately approved apply, set the GitHub **demo environment** variable
`DEMO_TRAINING_MEDIA_ENABLED=true`, then dispatch the normal demo deployment.
The flag defaults off so merging before infrastructure provisioning cannot break
existing demo deployments. No production deployment config changes.

The demo deploy installs a host systemd service/timer. The host instance provider
assumes `yawp-demo-training-media` for one hour and refreshes every ten minutes.
Only the demo web container mounts the private credential directory read-only;
the default SDK process provider reads the expiring credentials and refreshes
them as needed. The toolbox and renderer receive no credentials. EC2 metadata
stays disabled and blocked for every app container. An initial refresh failure
stops deployment before database changes or web rollout; later failures leave
the last credentials intact until their expiration. Inspect
`systemctl status yawp-demo-training-media.timer` and
`journalctl -u yawp-demo-training-media.service` for the safe failure message.

Both video and resource uploads use `AWS_S3_BUCKET_FOR_VIDEOS` and
`AWS_S3_REGION_FOR_VIDEOS`; there is no separate resource bucket variable.
Demo additionally receives `AWS_REGION`, `AWS_PROFILE`, and `AWS_CONFIG_FILE`.
No static access-key environment variables are emitted.

CORS permits only the existing demo admin origin, hosted Internal (which can
select the demo API), and the exact local Internal demo acceptance origin
`http://127.0.0.1:6998`. PUT responses expose `ETag`. No wildcard origin or other
localhost port is permitted. These origins grant no object authorization;
requests still require a valid presigned URL. GET/HEAD support signed playback.
Incomplete multipart uploads under the training prefix expire after one day.

#!/usr/bin/env bash
set -euo pipefail

[[ "${DEMO_TRAINING_MEDIA_ENABLED:-false}" == "true" ]] || exit 0
[[ "${PREVIEW_SLUG:-}" == "demo" && -z "${PR_NUMBER:-}" ]] || {
  echo "Demo training media requires the demo target" >&2
  exit 1
}
# Keep service paths fixed so deploy inputs cannot inject systemd directives.
[[ "${PREVIEW_ROOT:-}" == "/srv/yawp-demo" ]] || {
  echo "Demo training media requires PREVIEW_ROOT=/srv/yawp-demo" >&2
  exit 1
}
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node_path="$(command -v node)"
aws_path="$(command -v aws)"
sudo install -d -m 700 /usr/local/lib/yawp-demo-training-media
sudo install -m 700 "$script_dir/refresh-demo-training-media.mjs" /usr/local/lib/yawp-demo-training-media/refresh.mjs
sudo tee /etc/systemd/system/yawp-demo-training-media.service >/dev/null <<EOF
[Unit]
Description=Refresh scoped demo training media credentials
After=network-online.target
[Service]
Type=oneshot
UMask=0077
Environment=PATH=$(dirname "$aws_path"):/usr/local/bin:/usr/bin:/bin
Environment=DEMO_MEDIA_CREDENTIALS_DIR=/srv/yawp-demo/training-media-credentials
ExecStart=$node_path /usr/local/lib/yawp-demo-training-media/refresh.mjs
EOF
sudo tee /etc/systemd/system/yawp-demo-training-media.timer >/dev/null <<'EOF'
[Unit]
Description=Renew demo training media credentials every ten minutes
[Timer]
OnBootSec=1min
OnUnitActiveSec=10min
[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
# Fail before database/build/rollout work if the reviewed infra is not applied.
sudo systemctl start yawp-demo-training-media.service
sudo systemctl enable --now yawp-demo-training-media.timer

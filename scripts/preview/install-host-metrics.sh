#!/usr/bin/env bash
# Install or refresh the systemd timer that publishes Yawp/PreviewHost metrics.
set -euo pipefail

ROOT="${PREVIEW_ROOT:?PREVIEW_ROOT is required}"
METRICS_SCRIPT="${HOST_METRICS_SCRIPT:?HOST_METRICS_SCRIPT is required}"
METRICS_USER="${HOST_METRICS_USER:-$(id -un)}"
METRICS_SERVICE="${HOST_METRICS_SERVICE:-yawp-host-metrics}"
AWS_REGION="${PREVIEW_AWS_REGION:-us-east-1}"

[[ -f "$METRICS_SCRIPT" ]] || {
  echo "Metrics script not found: $METRICS_SCRIPT" >&2
  exit 1
}

chmod +x "$METRICS_SCRIPT"

sudo tee "/etc/systemd/system/${METRICS_SERVICE}.service" >/dev/null <<UNIT
[Unit]
Description=Publish Yawp host capacity metrics
After=docker.service network-online.target

[Service]
Type=oneshot
User=${METRICS_USER}
Environment=PREVIEW_ROOT=${ROOT}
Environment=PREVIEW_AWS_REGION=${AWS_REGION}
ExecStart=/usr/bin/env bash ${METRICS_SCRIPT}
UNIT

sudo tee "/etc/systemd/system/${METRICS_SERVICE}.timer" >/dev/null <<'UNIT'
[Unit]
Description=Publish Yawp host metrics every minute

[Timer]
OnBootSec=60
OnUnitActiveSec=60
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now "${METRICS_SERVICE}.timer"
if ! bash "$METRICS_SCRIPT"; then
  echo "Warning: initial metric publish failed; timer remains installed." >&2
fi

echo "Host metrics timer ${METRICS_SERVICE}.timer installed under ${ROOT}"

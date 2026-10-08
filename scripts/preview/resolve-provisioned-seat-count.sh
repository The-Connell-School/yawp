#!/usr/bin/env bash
# Provisioned preview-seat-N org count from a retained access-seat map.
# Lives next to deploy.sh on the preview host (main), not in the PR checkout.
resolve_provisioned_preview_seat_count() {
  local master="${PREVIEW_ACCESS_MASTER_ORGANIZATION_ID:-local-dev-org}"
  PREVIEW_ACCESS_MASTER_ORGANIZATION_ID="$master" node -e '
const master = process.env.PREVIEW_ACCESS_MASTER_ORGANIZATION_ID || "local-dev-org";
const seats = JSON.parse(process.env.PREVIEW_ACCESS_SEATS || "[]");
const fixtureOrgs = new Set(["preview-free-classroom", "preview-school-reporter-nav"]);
let maxNumber = 0;
let hasMaster = false;
for (const seat of seats) {
  const orgId = seat.organizationId;
  if (orgId === master) {
    hasMaster = true;
    continue;
  }
  if (fixtureOrgs.has(orgId)) continue;
  const match = /^preview-seat-([1-9][0-9]*)$/.exec(orgId);
  if (match) maxNumber = Math.max(maxNumber, Number(match[1]));
}
const count = maxNumber > 0 ? maxNumber : hasMaster ? 1 : 0;
if (!Number.isSafeInteger(count) || count < 1) {
  console.error("preview_provisioned_seat_count_invalid");
  process.exit(1);
}
process.stdout.write(String(count));
'
}

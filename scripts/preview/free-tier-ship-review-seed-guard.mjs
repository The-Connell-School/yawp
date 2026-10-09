/**
 * Free-tier ship-review seed is only safe on isolated PR preview databases.
 * Never run against yawp_demo or other shared databases.
 */
export function shouldRunFreeTierShipReviewSeed(databaseName) {
  if (!databaseName || typeof databaseName !== 'string') return false;
  return /^yawp_pr_[0-9]+$/.test(databaseName);
}

if (process.argv[2]) {
  process.exit(shouldRunFreeTierShipReviewSeed(process.argv[2]) ? 0 : 1);
}

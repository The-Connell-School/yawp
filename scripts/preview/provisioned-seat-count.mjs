import { countProvisionedPreviewSeatOrgs } from '../../packages/prisma/preview-access-code.ts';

const seats = JSON.parse(process.env.PREVIEW_ACCESS_SEATS ?? '[]');
const master =
  process.env.PREVIEW_ACCESS_MASTER_ORGANIZATION_ID || 'local-dev-org';
const count = countProvisionedPreviewSeatOrgs(seats, master);
if (!Number.isSafeInteger(count) || count < 1) {
  throw new Error('preview_provisioned_seat_count_invalid');
}
process.stdout.write(String(count));

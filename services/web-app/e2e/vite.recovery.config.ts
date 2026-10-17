// Local deployment metadata follows vite.resend.config.ts. Prisma still connects
// to the exact disposable DB/app role on loopback; no auth/delivery code is mocked.
import base from '../vite.config';
import path from 'node:path';
const database = new URL(process.env.E2E_DATABASE_URL || '');
if (
  process.env.SIGNON_PREVIEW_FIXTURE_TEST !== '1' ||
  !['127.0.0.1', 'localhost'].includes(database.hostname) ||
  database.pathname !== '/yawp_pr_999565' ||
  database.username !== 'yawp_pr_999565_app' ||
  database.search ||
  database.hash ||
  process.env.EMAIL_PROVIDER ||
  process.env.RESEND_API_KEY ||
  !process.env.TMPDIR ||
  !process.env.PREVIEW_ACCESS_SECRET
)
  throw new Error('Provider-free disposable recovery fixture required');
database.hostname = 'preview-postgres';
process.env.DATABASE_URL = database.href;
process.env.YAWP_ENVIRONMENT = 'preview';
process.env.PREVIEW_SLUG = 'pr-999565';
process.env.PREVIEW_DATA_MODE = 'seed';
process.env.PREVIEW_ACCESS_GATE = 'on';
process.env.PREVIEW_MASTER_ACCESS_CODE = 'local-fixture-master-access';
process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
  {
    code: 'fixture-otter-4193',
    organizationId: 'local-dev-org',
    label: 'Master',
  },
]);
delete process.env.DATABASE_SCHEMA;
export default {
  ...base,
  cacheDir: path.join(process.env.TMPDIR!, 'recovery-vite-cache'),
};

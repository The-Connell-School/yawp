/**
 * Playwright loads specs with Node, which cannot import app server modules that
 * pull in @app/prisma. Run this file with Bun from E2E helpers instead.
 */
import { provisionFreeClassroom } from '~/domain/free-tier/provision-free-classroom.server';

const applicationId = process.argv[2];
if (!applicationId) {
  console.error('Usage: bun e2e/helpers/provision-free-classroom-runner.ts <applicationId>');
  process.exit(1);
}

const result = await provisionFreeClassroom(applicationId);
console.log(JSON.stringify(result));
if (result.status !== 'provisioned' && result.status !== 'already_provisioned') {
  process.exit(2);
}

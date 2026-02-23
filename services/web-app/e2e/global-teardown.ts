import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function globalTeardown() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../../..');
  const e2eDir = path.join(rootDir, 'services/web-app/e2e');
  const e2eEnvPath = path.join(e2eDir, '.env.e2e');
  const ownedPath = path.join(e2eDir, '.e2e-owned');
  const pgOwnedPath = path.join(e2eDir, '.pg-owned');

  if (fs.existsSync(pgOwnedPath)) {
    try {
      execSync('docker rm -f yawp-e2e-postgres', { stdio: 'ignore' });
    } catch {}
  }

  for (const filePath of [
    path.join(e2eDir, '.e2e-context.json'),
    e2eEnvPath,
    ownedPath,
    pgOwnedPath,
  ]) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

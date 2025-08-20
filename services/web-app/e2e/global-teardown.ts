import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function globalTeardown() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../../..');
  const webAppDir = path.join(rootDir, 'services/web-app');
  const e2eDir = path.join(webAppDir, 'e2e');
  const e2eEnvPath = path.join(e2eDir, '.env.e2e');
  const ownedPath = path.join(e2eDir, '.e2e-owned');
  const pgOwnedPath = path.join(e2eDir, '.pg-owned');
  if (!fs.existsSync(e2eEnvPath)) return;
  const env = fs.readFileSync(e2eEnvPath, 'utf8');
  const entries = env
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('=')) as [string, string][];
  const vars = Object.fromEntries(entries) as Record<string, string>;
  const dbUrlStr = vars.DATABASE_URL;
  if (fs.existsSync(ownedPath)) {
    // Clean SQLite file if we created it
    if (dbUrlStr?.startsWith('file:')) {
      const sqlitePath = dbUrlStr.replace(/^file:/, '');
      try {
        fs.unlinkSync(sqlitePath);
      } catch {}
    }
    try {
      fs.unlinkSync(ownedPath);
    } catch {}
    try {
      fs.unlinkSync(e2eEnvPath);
    } catch {}
  }
  // Stop Docker Postgres container if we started it
  if (fs.existsSync(pgOwnedPath)) {
    try {
      const containerName = 'yawp-e2e-postgres';
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {}
    try {
      fs.unlinkSync(pgOwnedPath);
    } catch {}
  }
  // Always clean context file if present
  try {
    fs.unlinkSync(path.join(e2eDir, '.e2e-context.json'));
  } catch {}
}

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const repoRoot = join(import.meta.dir, '..');
const routesRoot = join(repoRoot, 'services/web-app/app/routes');

const allowedUnguardedWriteRoutes = new Set([
  'services/web-app/app/routes/api.domain.retention/route.ts',
  'services/web-app/app/routes/api.preferences.nav/route.tsx',
  'services/web-app/app/routes/api.preferences.submitted-papers-filter/route.tsx',
  // LTI launch establishes session and preview identities without read-only guard by design
  'services/web-app/app/routes/lti.launch/route.ts',
  // Public release-link account creation (no session yet)
  'services/web-app/app/routes/free.join/route.tsx',
]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) return routeFiles(fullPath);
      if (!/\.(ts|tsx)$/.test(entry)) return [];
      if (/\.test\.(ts|tsx)$/.test(entry)) return [];
      return fullPath;
    })
    .sort();
}

function hasAction(source: string) {
  return /export\s+async\s+function\s+action\b/.test(source)
    || /export\s+const\s+action\b/.test(source);
}

function hasDatabaseWrite(source: string) {
  return /prisma\.\$transaction\s*\(/.test(source)
    || /prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(
      source
    )
    || /\btx\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(
      source
    );
}

function hasReadOnlyGuard(source: string) {
  return /\b(requireMutableRequest|requireUserId|requireAdmin|requireSuperAdmin|requireOwner|getGradingActor|logout)\s*\(/.test(
    source
  );
}

function isAllowedPublicAuthRoute(relativePath: string) {
  return relativePath.startsWith('services/web-app/app/routes/auth.');
}

describe('read-only impersonation route contract', () => {
  test('database-writing route actions use the read-only impersonation guard', () => {
    const unguarded = routeFiles(routesRoot)
      .map((file) => {
        const source = readFileSync(file, 'utf8');
        return {
          file,
          relativePath: relative(repoRoot, file),
          source,
        };
      })
      .filter(({ relativePath, source }) => {
        if (!hasAction(source)) return false;
        if (!hasDatabaseWrite(source)) return false;
        if (hasReadOnlyGuard(source)) return false;
        if (allowedUnguardedWriteRoutes.has(relativePath)) return false;
        if (isAllowedPublicAuthRoute(relativePath)) return false;
        return true;
      })
      .map(({ relativePath }) => relativePath);

    expect(unguarded).toEqual([]);
  });
});

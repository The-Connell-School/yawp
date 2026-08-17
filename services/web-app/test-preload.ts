import { resolve } from 'path';

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-secret-for-unit-tests';

// bun's mock.module() replaces a module for the rest of the test run — it is
// not scoped to a single file, and mock.restore() does not undo it (see
// https://github.com/oven-sh/bun/issues/7823). It appears to do this by
// mutating the live module namespace object's bindings in place rather than
// swapping in a fresh object, so holding onto a reference obtained via
// `await import(...)` does NOT protect you from a later mock.module() call —
// the values behind that same reference change too. Several test files need
// to partially mock a shared module (override one export, keep the rest
// real). This preload runs before bun's collection pass touches any test
// file, so copying each export into a plain object here — not just holding
// the namespace reference — captures values that are truly immune to any
// later mock.module() call. Test files should restore from this cache
// (`globalThis.__realModules`) instead of re-importing the path.
declare global {
  // eslint-disable-next-line no-var
  var __realModules: Record<string, Record<string, unknown>>;
}

async function snapshot(specifier: string) {
  const mod: Record<string, unknown> = await import(specifier);
  return { ...mod };
}

// The root bunfig.toml preloads this file for every `bun test` in the repo, including CI
// runs that name only script tests (scripts/deployment-contract.test.ts, scripts/preview/).
// Those runs have no web-app runtime available: the snapshots below reach
// ~/utils/auth.server, which imports @app/prisma and builds a client requiring DATABASE_URL,
// so snapshotting unconditionally fails the whole run before a single script test executes.
// A preload runs once per test file with that file's absolute path as Bun.argv[1], so gate
// the snapshot on whether the file being loaded is a web-app test.
function isWebAppTestFile(): boolean {
  const testFile = Bun.argv[1];
  if (!testFile) return true;
  return resolve(process.cwd(), testFile).startsWith(`${import.meta.dir}/`);
}

globalThis.__realModules = {};

if (isWebAppTestFile()) {
  globalThis.__realModules = {
    // Needed by the owner-facing authorization tests: several route test files stub
    // requireOwner/requireMembership wholesale, which would otherwise mean no test in the
    // suite ever runs the real cross-organization ownership check.
    '~/utils/auth.server': await snapshot('~/utils/auth.server'),
    '~/utils/assignment-type-access.server': await snapshot(
      '~/utils/assignment-type-access.server'
    ),
    '~/domain/thesis-prompts/saved-prompts.server': await snapshot(
      '~/domain/thesis-prompts/saved-prompts.server'
    ),
    '~/domain/daily-pages-prompts/saved-prompts.server': await snapshot(
      '~/domain/daily-pages-prompts/saved-prompts.server'
    ),
    // The class-assignment start test stubs findStudentGroupDocument, which would
    // otherwise leave arrangeGroups/openGroups missing for the groups-route test
    // that runs after it.
    '~/domain/collaboration/groups.server': await snapshot(
      '~/domain/collaboration/groups.server'
    ),
  };
}

export {};

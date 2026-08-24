import { resolve } from 'path';

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-secret-for-unit-tests';
// Provide a benign default so Prisma client construction in imported modules does not throw.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:password@127.0.0.1:5432/yawp_test';

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
    // The shared-drafts test stubs both of these wholesale to keep the loader
    // off the database; without a pristine copy every later file would see the
    // two-export stub instead of the real modules.
    '~/utils/school-year-scope.server': await snapshot(
      '~/utils/school-year-scope.server'
    ),
    '~/utils/student-assignment-type-scopes.server': await snapshot(
      '~/utils/student-assignment-type-scopes.server'
    ),
    // The auto-arrange test stubs arrangeGroups, which the groups-route test
    // also needs real.
    '~/domain/collaboration/auto-arrange.server': await snapshot(
      '~/domain/collaboration/auto-arrange.server'
    ),
    // The contribution read model stubs these two; other files need them real.
    '~/domain/collaboration/room-store.server': await snapshot(
      '~/domain/collaboration/room-store.server'
    ),
    '~/domain/collaboration/authorship.server': await snapshot(
      '~/domain/collaboration/authorship.server'
    ),
    // The group-draft route stubs getIsPlatformAdmin and needs the read/author
    // scope predicates from the same module left real.
    '~/utils/document-access.server': await snapshot(
      '~/utils/document-access.server'
    ),
    // The group-draft route stubs these wholesale; other files need them real.
    '~/domain/collaboration/group-grade.server': await snapshot(
      '~/domain/collaboration/group-grade.server'
    ),
    '~/domain/collaboration/member-grades.server': await snapshot(
      '~/domain/collaboration/member-grades.server'
    ),
    // The group-submit test stubs yUpdateToSnapshot; the updates-route test
    // asserts on the real dual-written snapshot and needs it back.
    '~/domain/collaboration/snapshot': await snapshot(
      '~/domain/collaboration/snapshot'
    ),
    '~/domain/collaboration/comments.server': await snapshot(
      '~/domain/collaboration/comments.server'
    ),
    // The shared-drafts test drives both sides of the student-shared-draft gate
    // by stubbing `studentStartedSharedDraftsEnabled`; every other file needs
    // the group-mode constants in this module real.
    '~/domain/assignments/collaboration': await snapshot(
      '~/domain/assignments/collaboration'
    ),
    '~/domain/documents.server': await snapshot('~/domain/documents.server'),
  };
}

export {};

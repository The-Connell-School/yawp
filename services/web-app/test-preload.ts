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

globalThis.__realModules = {
  '~/utils/assignment-type-access.server': await snapshot(
    '~/utils/assignment-type-access.server'
  ),
  '~/domain/thesis-prompts/saved-prompts.server': await snapshot(
    '~/domain/thesis-prompts/saved-prompts.server'
  ),
  '~/domain/daily-pages-prompts/saved-prompts.server': await snapshot(
    '~/domain/daily-pages-prompts/saved-prompts.server'
  ),
};

export {};

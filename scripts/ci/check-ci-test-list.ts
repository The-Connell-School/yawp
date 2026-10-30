// PLAN item 16: ci.yml names every web-app test file it runs. Fail when a
// Lesson Planner test file exists but no CI step names it, so new suites can't
// silently never run. Usage: bun scripts/ci/check-ci-test-list.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const WEB_APP = 'services/web-app';
const ROOTS = ['app'];
const MATCH = /lesson-planner/;
const TEST_FILE = /\.test\.tsx?$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEST_FILE.test(name)) out.push(full);
  }
  return out;
}

export function findUnlistedTests(repoRoot: string, workflowText?: string): string[] {
  const workflow =
    workflowText ?? readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  const webApp = join(repoRoot, WEB_APP);
  return ROOTS.flatMap((root) => walk(join(webApp, root)))
    .map((file) => relative(webApp, file))
    .filter((file) => MATCH.test(file))
    .filter((file) => !workflow.includes(file))
    .sort();
}

if (import.meta.main) {
  const missing = findUnlistedTests(process.cwd());
  if (missing.length > 0) {
    console.error(
      `ci.yml does not run ${missing.length} Lesson Planner test file(s). Add them to the "Feature flag unit tests" loop:\n` +
        missing.map((f) => `  ${f}`).join('\n')
    );
    process.exit(1);
  }
  console.log('ci.yml names every Lesson Planner test file.');
}

import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  classifySuiteSpecs,
  requiredMissingSpecs,
  suiteSpecs,
} from './run-free-tier-demo-e2e';

async function touch(root: string, relativePath: string) {
  const fullPath = join(root, relativePath);
  await mkdir(join(fullPath, '..'), { recursive: true });
  await writeFile(fullPath, '');
}

describe('free-tier demo suite runner manifest', () => {
  test('fails required default coverage when seeded repro specs are absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'free-tier-demo-suite-'));
    for (const spec of suiteSpecs.filter(
      (candidate) => candidate.runByDefault && candidate.source === 'merged'
    )) {
      await touch(root, spec.path);
    }

    const { missing } = await classifySuiteSpecs(root);
    const missingRequired = requiredMissingSpecs(missing).map((spec) => spec.path);

    expect(missingRequired).toContain('e2e/tests/free-tier.event-auto-admit.spec.ts');
    expect(missingRequired).toContain('e2e/tests/free-tier.event-waitlist.spec.ts');
    expect(missingRequired).toContain('e2e/tests/free-tier.disabled-expired.spec.ts');
    expect(missingRequired).toContain('e2e/tests/free-tier.repeat-signup.spec.ts');
    expect(missingRequired).toContain('e2e/tests/free-tier.caps-limits.spec.ts');
    expect(missingRequired).toContain('e2e/tests/auth.free-tier-student-signin.spec.ts');
  });

  test('passes required coverage when every default spec is present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'free-tier-demo-suite-'));
    for (const spec of suiteSpecs.filter((candidate) => candidate.runByDefault)) {
      await touch(root, spec.path);
    }

    const { missing } = await classifySuiteSpecs(root);

    expect(requiredMissingSpecs(missing)).toEqual([]);
  });
});

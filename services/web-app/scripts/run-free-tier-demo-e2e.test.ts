import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  classifySuiteSpecs,
  focusedHostedDemoSkipArtifacts,
  resolveBrowserEnv,
  requiredMissingSpecs,
  suiteSpecs,
  suiteHostedDemoSkipArtifact,
  writeSuiteEvidence,
} from './run-free-tier-demo-e2e';

async function touch(root: string, relativePath: string) {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
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

  test('keeps suite hosted-demo skip artifact distinct from focused spec skips', async () => {
    const root = await mkdtemp(join(tmpdir(), 'free-tier-demo-suite-shots-'));
    const focusedArtifact = focusedHostedDemoSkipArtifacts[0];
    await writeFile(
      join(root, focusedArtifact),
      'focused hosted skip evidence must remain durable'
    );

    await writeSuiteEvidence([], [], {
      shotDirectory: root,
      env: {},
    });

    expect(suiteHostedDemoSkipArtifact).toBe('suite-hosted-demo-skip.txt');
    expect(focusedHostedDemoSkipArtifacts).not.toContain(suiteHostedDemoSkipArtifact);
    expect(await readFile(join(root, focusedArtifact), 'utf8')).toBe(
      'focused hosted skip evidence must remain durable'
    );
    expect(await readFile(join(root, suiteHostedDemoSkipArtifact), 'utf8')).toContain(
      'Hosted demo free-tier suite cases skipped.'
    );
  });

  test('uses explicit PW_EXECUTABLE_PATH before cached browser discovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'free-tier-browser-cache-'));
    const explicit = join(root, 'custom-chrome');
    await writeFile(explicit, '');

    const result = resolveBrowserEnv({
      PLAYWRIGHT_BROWSERS_PATH: join(root, 'missing-cache'),
      PW_EXECUTABLE_PATH: explicit,
    });

    expect(result.executablePath).toBe(explicit);
    expect(result.env.PW_EXECUTABLE_PATH).toBe(explicit);
    expect(result.message).toContain('PW_EXECUTABLE_PATH');
  });

  test('chooses newest cached chromium executable when headless shell may be mismatched', async () => {
    const root = await mkdtemp(join(tmpdir(), 'free-tier-browser-cache-'));
    const oldChrome = join(root, 'chromium-1243', 'chrome-linux64', 'chrome');
    const newChrome = join(root, 'chromium-1248', 'chrome-linux64', 'chrome');
    const newShell = join(
      root,
      'chromium_headless_shell-1248',
      'chrome-headless-shell-linux64',
      'chrome-headless-shell'
    );
    await mkdir(dirname(oldChrome), { recursive: true });
    await mkdir(dirname(newChrome), { recursive: true });
    await mkdir(dirname(newShell), { recursive: true });
    await writeFile(oldChrome, '');
    await writeFile(newChrome, '');
    await writeFile(newShell, '');

    const result = resolveBrowserEnv({ PLAYWRIGHT_BROWSERS_PATH: root });

    expect(result.executablePath).toBe(newChrome);
    expect(result.env.PW_EXECUTABLE_PATH).toBe(newChrome);
    expect(result.message).toContain('chromium r1248');
  });

  test('reports an actionable browser cache error when no executable exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'free-tier-browser-cache-'));

    expect(() => resolveBrowserEnv({ PLAYWRIGHT_BROWSERS_PATH: root })).toThrow(
      /set PW_EXECUTABLE_PATH/
    );
  });
});

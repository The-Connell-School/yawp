import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildFailureSection } from './file-free-tier-qa-failure';

const bunExecutable = process.execPath;

describe('free-tier QA failure filing', () => {
  test('preserves the lane failure template fields', () => {
    const section = buildFailureSection({
      slug: 'qa-suite-ci',
      date: '2026-10-13',
      severity: 'major',
      env: 'demo',
      repro: 'Run `bun run test:e2e:free-tier-demo`.',
      expected: 'The free-tier demo E2E suite passes.',
      actual: 'The suite found a regression.',
      screenshots:
        '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-suite-ci',
      filedToFixes: 'no - add backlog item under P0b',
    });

    expect(section).toContain('## 2026-10-13 — qa-suite-ci');
    expect(section).toContain('- severity: major');
    expect(section).toContain('- env: demo');
    expect(section).toContain('- repro: Run `bun run test:e2e:free-tier-demo`.');
    expect(section).toContain('- expected: The free-tier demo E2E suite passes.');
    expect(section).toContain('- actual: The suite found a regression.');
    expect(section).toContain(
      '- screenshots: /home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-suite-ci'
    );
    expect(section).toContain('- filed_to_fixes: no - add backlog item under P0b');
    expect(section).not.toContain('- Command:');
    expect(section).not.toContain('- Evidence:');
  });

  test('CLI appends FAILURES.md and prepends a P0b fixes backlog item', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-tier-qa-failure-'));
    const failuresPath = join(dir, 'FAILURES.md');
    const backlogPath = join(dir, 'BACKLOG.md');
    await writeFile(failuresPath, '# Failures\n');
    await writeFile(
      backlogPath,
      ['# Fixes Backlog', '', '## P0a', '- existing P0a', '', '## P0b', '- existing P0b', ''].join(
        '\n'
      )
    );

    const result = spawnSync(
      bunExecutable,
      [
        join(import.meta.dir, 'file-free-tier-qa-failure.ts'),
        '--id=ft-demo-regression',
        '--slug=qa-regression-loop-review',
        '--title=Demo regression evidence',
        '--evidence=/tmp/shots/qa-regression-loop-review',
        '--date=2026-10-13',
      ],
      {
        env: {
          ...process.env,
          FREE_TIER_QA_FAILURES_PATH: failuresPath,
          FREE_TIER_FIXES_BACKLOG_PATH: backlogPath,
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    const failures = await readFile(failuresPath, 'utf8');
    expect(failures).toContain('## 2026-10-13 — qa-regression-loop-review');
    expect(failures).toContain('- screenshots: /tmp/shots/qa-regression-loop-review');
    expect(failures).toContain('- filed_to_fixes: yes');

    const backlog = await readFile(backlogPath, 'utf8');
    expect(backlog).toContain(
      '## P0b\n- [ ] todo | **ft-demo-regression** Demo regression evidence\n- existing P0b'
    );
  });

  test('CLI prepends under the real P0b heading when earlier prose mentions P0b', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-tier-qa-failure-'));
    const failuresPath = join(dir, 'FAILURES.md');
    const backlogPath = join(dir, 'BACKLOG.md');
    const earlierProse =
      '- Planner note: no fresh QA filing is missing from P0b.';
    await writeFile(failuresPath, '# Failures\n');
    await writeFile(
      backlogPath,
      [
        '# Fixes Backlog',
        '',
        '## P0 — Seeded bugs',
        earlierProse,
        '- existing P0',
        '',
        '## P0b — From QA FAILURES.md (planner prepends as filed)',
        '- existing P0b',
        '',
      ].join('\n')
    );

    const result = spawnSync(
      bunExecutable,
      [
        join(import.meta.dir, 'file-free-tier-qa-failure.ts'),
        '--id=ft-demo-regression',
        '--slug=qa-regression-loop-review',
        '--title=Demo regression evidence',
        '--evidence=/tmp/shots/qa-regression-loop-review',
        '--date=2026-10-13',
      ],
      {
        env: {
          ...process.env,
          FREE_TIER_QA_FAILURES_PATH: failuresPath,
          FREE_TIER_FIXES_BACKLOG_PATH: backlogPath,
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    const backlog = await readFile(backlogPath, 'utf8');
    expect(backlog).toContain([earlierProse, '- existing P0'].join('\n'));
    expect(backlog).toContain(
      [
        '## P0b — From QA FAILURES.md (planner prepends as filed)',
        '- [ ] todo | **ft-demo-regression** Demo regression evidence',
        '- existing P0b',
      ].join('\n')
    );
  });

  test('CLI dedupes repeat filings for the same slug and backlog id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-tier-qa-failure-'));
    const failuresPath = join(dir, 'FAILURES.md');
    const backlogPath = join(dir, 'BACKLOG.md');
    await writeFile(failuresPath, '# Failures\n');
    await writeFile(
      backlogPath,
      ['# Fixes Backlog', '', '## P0b', '- existing P0b', ''].join('\n')
    );

    const args = [
      join(import.meta.dir, 'file-free-tier-qa-failure.ts'),
      '--id=ft-demo-regression',
      '--slug=qa-regression-loop-review',
      '--title=Demo regression evidence',
      '--evidence=/tmp/shots/qa-regression-loop-review',
      '--date=2026-10-13',
    ];
    for (let i = 0; i < 2; i += 1) {
      const result = spawnSync(bunExecutable, args, {
        env: {
          ...process.env,
          FREE_TIER_QA_FAILURES_PATH: failuresPath,
          FREE_TIER_FIXES_BACKLOG_PATH: backlogPath,
        },
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
    }

    const failures = await readFile(failuresPath, 'utf8');
    expect(failures.match(/## 2026-10-13 — qa-regression-loop-review/g)).toHaveLength(
      1
    );

    const backlog = await readFile(backlogPath, 'utf8');
    expect(backlog.match(/\*\*ft-demo-regression\*\*/g)).toHaveLength(1);
  });

  test('CLI dedupes already-filed waitlist-copy failure families by explicit key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-tier-qa-failure-'));
    const failuresPath = join(dir, 'FAILURES.md');
    const backlogPath = join(dir, 'BACKLOG.md');
    await writeFile(
      failuresPath,
      [
        '# Failures',
        '',
        '## 2026-10-13 — qa-event-waitlist-copy-regression',
        '- actual: A LEAD waitlist application showed Check your email for your join link.',
        '',
      ].join('\n')
    );
    await writeFile(
      backlogPath,
      [
        '# Fixes Backlog',
        '',
        '## P0b',
        '- [ ] todo | **ft-event-waitlist-auto-admit** LEAD waitlist application showed join-link copy',
        '',
      ].join('\n')
    );

    const result = spawnSync(
      bunExecutable,
      [
        join(import.meta.dir, 'file-free-tier-qa-failure.ts'),
        '--id=ft-qa-suite-mainline-contract-refresh',
        '--slug=qa-suite-mainline-contract-refresh',
        '--title=Demo waitlist-copy regression',
        '--evidence=/tmp/shots/qa-suite-mainline-contract-refresh',
        '--date=2026-10-13',
        '--dedupe-key=LEAD waitlist application',
      ],
      {
        env: {
          ...process.env,
          FREE_TIER_QA_FAILURES_PATH: failuresPath,
          FREE_TIER_FIXES_BACKLOG_PATH: backlogPath,
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipping duplicate free-tier QA failure entry');

    const failures = await readFile(failuresPath, 'utf8');
    expect(failures).not.toContain('qa-suite-mainline-contract-refresh');

    const backlog = await readFile(backlogPath, 'utf8');
    expect(backlog).not.toContain('ft-qa-suite-mainline-contract-refresh');
    expect(backlog.match(/LEAD waitlist application/g)).toHaveLength(1);
  });

  test('CLI still appends failure evidence when the fixes backlog cannot be updated', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-tier-qa-failure-'));
    const failuresPath = join(dir, 'FAILURES.md');
    const missingBacklogPath = join(dir, 'missing', 'BACKLOG.md');

    const result = spawnSync(
      bunExecutable,
      [
        join(import.meta.dir, 'file-free-tier-qa-failure.ts'),
        '--id=ft-demo-regression',
        '--slug=qa-regression-loop-review',
        '--title=Demo regression evidence',
        '--evidence=/tmp/shots/qa-regression-loop-review',
        '--date=2026-10-13',
      ],
      {
        env: {
          ...process.env,
          FREE_TIER_QA_FAILURES_PATH: failuresPath,
          FREE_TIER_FIXES_BACKLOG_PATH: missingBacklogPath,
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Could not update fixes backlog automatically');

    const failures = await readFile(failuresPath, 'utf8');
    expect(failures).toContain('## 2026-10-13 — qa-regression-loop-review');
    expect(failures).toContain(
      '- filed_to_fixes: no - add - [ ] todo | **ft-demo-regression** Demo regression evidence under P0b'
    );
  });

  test('CLI records filed_to_fixes no when the fixes backlog has no P0b section', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-tier-qa-failure-'));
    const failuresPath = join(dir, 'FAILURES.md');
    const backlogPath = join(dir, 'BACKLOG.md');
    await writeFile(backlogPath, '# Fixes Backlog\n\n## P1\n- later\n');

    const result = spawnSync(
      bunExecutable,
      [
        join(import.meta.dir, 'file-free-tier-qa-failure.ts'),
        '--id=ft-demo-regression',
        '--slug=qa-regression-loop-review',
        '--title=Demo regression evidence',
        '--evidence=/tmp/shots/qa-regression-loop-review',
        '--date=2026-10-13',
      ],
      {
        env: {
          ...process.env,
          FREE_TIER_QA_FAILURES_PATH: failuresPath,
          FREE_TIER_FIXES_BACKLOG_PATH: backlogPath,
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Could not update fixes backlog automatically');

    const failures = await readFile(failuresPath, 'utf8');
    expect(failures).toContain(
      '- filed_to_fixes: no - add - [ ] todo | **ft-demo-regression** Demo regression evidence under P0b'
    );
  });
});

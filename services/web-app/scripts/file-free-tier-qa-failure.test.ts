import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildFailureSection, knownFailureSkipReason } from './file-free-tier-qa-failure';

const bunExecutable = process.execPath;

describe('free-tier QA failure filing', () => {
  test('detects the already-filed waitlist-copy known failure family', () => {
    const reason = knownFailureSkipReason({
      failuresBody: buildFailureSection({
        slug: 'qa-event-waitlist-copy-regression',
        date: '2026-10-13',
        severity: 'major',
        env: 'demo',
        repro: 'Run the focused waitlist-copy spec.',
        expected: 'A non-bypass demo event token shows waitlist copy.',
        actual: 'The page showed Check your email for your join link.',
        screenshots: '/tmp/shots/qa-event-waitlist-copy-regression',
        filedToFixes: 'no - already present under P0b',
      }),
      backlogBody: [
        '# Fixes Backlog',
        '',
        '## P0b',
        '- [ ] todo | **ft-event-waitlist-auto-admit** Demo waitlist event link shows join-link copy.',
        '',
      ].join('\n'),
      id: 'ft-qa-regression-suite-fresh-main',
      slug: 'qa-regression-suite-fresh-main',
      title: 'Free-tier demo suite fresh-main waitlist event-link copy regression',
      expected: 'A bypassWaitlist=false demo event token shows waitlist copy.',
      actual: 'The deterministic demo path displayed Check your email for your join link.',
    });

    expect(reason).toBe('waitlist-copy known failure already filed');
  });

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
      'Triage note: items labeled P0b below are handled by the fixes lane after QA filing.';
    await writeFile(failuresPath, '# Failures\n');
    await writeFile(
      backlogPath,
      [
        '# Fixes Backlog',
        '',
        earlierProse,
        '',
        '## P0a',
        '- existing P0a',
        '',
        '## P0b',
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
    expect(backlog).toContain(earlierProse);
    expect(backlog).toContain(
      [
        earlierProse,
        '',
        '## P0a',
        '- existing P0a',
        '',
        '## P0b',
        '- [ ] todo | **ft-demo-regression** Demo regression evidence',
        '- existing P0b',
      ].join('\n')
    );
  });

  test('CLI skips an exact duplicate instead of appending or prepending', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-tier-qa-failure-'));
    const failuresPath = join(dir, 'FAILURES.md');
    const backlogPath = join(dir, 'BACKLOG.md');
    await writeFile(
      failuresPath,
      [
        '# Failures',
        '',
        '## 2026-10-13 — qa-suite-ci',
        '- severity: major',
        '- env: demo',
        '- repro: Run `bun run test:e2e:free-tier-demo`.',
        '- expected: The suite passes.',
        '- actual: The suite found a regression.',
        '- screenshots: /tmp/shots/qa-suite-ci',
        '- filed_to_fixes: yes',
        '',
      ].join('\n')
    );
    await writeFile(
      backlogPath,
      ['# Fixes Backlog', '', '## P0b', '- [ ] todo | **ft-demo-regression** Demo regression evidence', ''].join(
        '\n'
      )
    );

    const result = spawnSync(
      bunExecutable,
      [
        join(import.meta.dir, 'file-free-tier-qa-failure.ts'),
        '--id=ft-demo-regression',
        '--slug=qa-suite-ci',
        '--title=Demo regression evidence',
        '--evidence=/tmp/shots/qa-suite-ci',
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
    expect(result.stderr).toContain('Known failure already filed');
    expect(await readFile(failuresPath, 'utf8')).toBe(
      [
        '# Failures',
        '',
        '## 2026-10-13 — qa-suite-ci',
        '- severity: major',
        '- env: demo',
        '- repro: Run `bun run test:e2e:free-tier-demo`.',
        '- expected: The suite passes.',
        '- actual: The suite found a regression.',
        '- screenshots: /tmp/shots/qa-suite-ci',
        '- filed_to_fixes: yes',
        '',
      ].join('\n')
    );
    expect(await readFile(backlogPath, 'utf8')).toBe(
      ['# Fixes Backlog', '', '## P0b', '- [ ] todo | **ft-demo-regression** Demo regression evidence', ''].join(
        '\n'
      )
    );
  });

  test('CLI skips the known waitlist-copy condition without duplicating lane files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-tier-qa-failure-'));
    const failuresPath = join(dir, 'FAILURES.md');
    const backlogPath = join(dir, 'BACKLOG.md');
    const existingFailures = buildFailureSection({
      slug: 'qa-event-waitlist-copy-regression',
      date: '2026-10-13',
      severity: 'major',
      env: 'demo',
      repro: 'Run the focused waitlist-copy spec.',
      expected: 'A non-bypass demo event token creates a LEAD waitlist application.',
      actual: 'The page status showed Check your email for your join link.',
      screenshots: '/tmp/shots/qa-event-waitlist-copy-regression',
      filedToFixes: 'yes',
    });
    const existingBacklog = [
      '# Fixes Backlog',
      '',
      '## P0b',
      '- [ ] todo | **ft-event-waitlist-auto-admit** Demo waitlist event link shows join-link copy.',
      '- existing P0b',
      '',
    ].join('\n');
    await writeFile(failuresPath, `# Failures\n${existingFailures}`);
    await writeFile(backlogPath, existingBacklog);

    const result = spawnSync(
      bunExecutable,
      [
        join(import.meta.dir, 'file-free-tier-qa-failure.ts'),
        '--id=ft-qa-regression-suite-fresh-main',
        '--slug=qa-regression-suite-fresh-main',
        '--title=Free-tier demo suite fresh-main waitlist event-link copy regression',
        '--evidence=/tmp/shots/qa-regression-suite-fresh-main',
        '--date=2026-10-13',
        '--expected=A bypassWaitlist=false demo event token shows waitlist copy.',
        '--actual=The deterministic demo path displayed Check your email for your join link.',
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
    expect(result.stderr).toContain('waitlist-copy known failure already filed');
    const failures = await readFile(failuresPath, 'utf8');
    expect(failures).toContain('qa-event-waitlist-copy-regression');
    expect(failures).not.toContain('qa-regression-suite-fresh-main');
    expect(await readFile(backlogPath, 'utf8')).toBe(existingBacklog);
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

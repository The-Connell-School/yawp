import { describe, expect, test } from 'bun:test';

import { buildFailureSection } from './file-free-tier-qa-failure';

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
});

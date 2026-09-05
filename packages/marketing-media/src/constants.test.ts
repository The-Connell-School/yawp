import { describe, expect, test } from 'bun:test';

import { MARKETING_JOB_STATUSES, TERMINAL_JOB_STATUSES } from './constants';

describe('the draft status', () => {
  // A brief becomes a plan the operator reads before anything is filmed. The
  // renderer claims QUEUED, so a DRAFT job is inert to it by construction —
  // nothing films until a person says film it.
  test('exists and is not terminal', () => {
    expect(MARKETING_JOB_STATUSES).toContain('DRAFT');
    expect(TERMINAL_JOB_STATUSES).not.toContain('DRAFT');
  });

  test('comes before the queue', () => {
    const statuses = MARKETING_JOB_STATUSES as readonly string[];
    expect(statuses.indexOf('DRAFT')).toBeLessThan(statuses.indexOf('QUEUED'));
  });
});

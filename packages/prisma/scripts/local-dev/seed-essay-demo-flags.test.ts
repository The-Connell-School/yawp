import { describe, expect, mock, test } from 'bun:test';
import { ensureAssignmentSummaryModelsOnForPreview } from './seed-essay-demo';

describe('ensureAssignmentSummaryModelsOnForPreview', () => {
  test('starts models and the planner hand-offs on, create-only', async () => {
    const upsert = mock(async () => ({}));
    await ensureAssignmentSummaryModelsOnForPreview({
      setting: { upsert },
    } as never);
    const calls = upsert.mock.calls.map((call) => (call as any[])[0]);
    expect(calls.map((call) => call.where.name).sort()).toEqual([
      'feature_flag.assignment_summary_models',
      'feature_flag.assignment_summary_planner',
    ]);
    for (const call of calls) {
      expect(JSON.parse(call.create.value)).toEqual({
        mode: 'everyone',
        orgIds: [],
      });
      // A later change made from yawp-internal is never overwritten.
      expect(call.update).toEqual({});
    }
  });
});

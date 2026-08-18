import { describe, expect, it } from 'bun:test';
import { resolveClassInsightGenerateAvailability } from './class-insight-generate-availability';

describe('resolveClassInsightGenerateAvailability', () => {
  it('blocks generation when the organization gate is off', () => {
    expect(
      resolveClassInsightGenerateAvailability({
        classInsightsEnabled: false,
        gradedCount: 5,
      })
    ).toEqual({
      canGenerate: false,
      reason:
        "Class performance summaries aren't enabled for your organization.",
    });
  });

  it('blocks generation when nothing has been graded yet', () => {
    expect(
      resolveClassInsightGenerateAvailability({
        classInsightsEnabled: true,
        gradedCount: 0,
      })
    ).toEqual({
      canGenerate: false,
      reason: 'Grade a few submissions first, then generate class insights.',
    });
  });

  it('allows a first generation once something is graded', () => {
    expect(
      resolveClassInsightGenerateAvailability({
        classInsightsEnabled: true,
        gradedCount: 2,
      })
    ).toEqual({ canGenerate: true });
  });

  it('blocks regeneration during the 24-hour cooldown', () => {
    const now = new Date('2026-07-30T12:00:00.000Z');
    const generatedAt = new Date('2026-07-30T11:00:00.000Z');

    expect(
      resolveClassInsightGenerateAvailability({
        classInsightsEnabled: true,
        gradedCount: 10,
        existingInsight: { submissionCount: 5, generatedAt },
        now,
      })
    ).toEqual({ canGenerate: false, reason: 'Regenerate in 23 hours.' });
  });

  it('blocks regeneration once the cooldown ends if nothing new was graded', () => {
    const generatedAt = new Date('2026-07-28T12:00:00.000Z');
    const now = new Date(generatedAt.getTime() + 25 * 60 * 60 * 1000);

    expect(
      resolveClassInsightGenerateAvailability({
        classInsightsEnabled: true,
        gradedCount: 5,
        existingInsight: { submissionCount: 5, generatedAt },
        now,
      })
    ).toEqual({
      canGenerate: false,
      reason: 'No new graded submissions since the last summary.',
    });
  });

  it('allows regeneration once the cooldown ends and new work was graded', () => {
    const generatedAt = new Date('2026-07-28T12:00:00.000Z');
    const now = new Date(generatedAt.getTime() + 25 * 60 * 60 * 1000);

    expect(
      resolveClassInsightGenerateAvailability({
        classInsightsEnabled: true,
        gradedCount: 8,
        existingInsight: { submissionCount: 5, generatedAt },
        now,
      })
    ).toEqual({ canGenerate: true });
  });
});

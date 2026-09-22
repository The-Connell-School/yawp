import { describe, expect, it } from 'bun:test';
import {
  CLASS_INSIGHT_REGENERATION_COOLDOWN_MS,
  classInsightRegenerationCooldownMessage,
  classInsightRegenerationCountdownTickMs,
  formatClassInsightRegenerationWait,
  getClassInsightRegenerationCooldown,
} from './class-insight-regeneration-cooldown';

describe('class-insight-regeneration-cooldown', () => {
  it('treats a fresh summary as in cooldown for 24 hours', () => {
    const now = new Date('2026-07-30T12:00:00.000Z');
    const generatedAt = new Date('2026-07-30T11:00:00.000Z');
    const cooldown = getClassInsightRegenerationCooldown(generatedAt, now);

    expect(cooldown.inCooldown).toBe(true);
    expect(cooldown.remainingMs).toBe(23 * 60 * 60 * 1000);
    expect(classInsightRegenerationCooldownMessage(cooldown.remainingMs)).toBe(
      'Regenerate in 23 hours.'
    );
  });

  it('allows regeneration after the cooldown expires', () => {
    const generatedAt = new Date('2026-07-28T12:00:00.000Z');
    const now = new Date(
      generatedAt.getTime() + CLASS_INSIGHT_REGENERATION_COOLDOWN_MS + 1
    );
    const cooldown = getClassInsightRegenerationCooldown(generatedAt, now);

    expect(cooldown.inCooldown).toBe(false);
    expect(classInsightRegenerationCooldownMessage(cooldown.remainingMs)).toBeNull();
  });

  it('formats sub-hour waits in minutes only', () => {
    expect(formatClassInsightRegenerationWait(45 * 60 * 1000)).toBe(
      '45 minutes'
    );
    expect(classInsightRegenerationCooldownMessage(45 * 60 * 1000)).toBe(
      'Regenerate in 45 minutes.'
    );
  });

  it('uses hourly ticks for long waits and minute ticks near the end', () => {
    expect(classInsightRegenerationCountdownTickMs(2 * 60 * 60 * 1000)).toBe(
      60 * 60 * 1000
    );
    expect(classInsightRegenerationCountdownTickMs(30 * 60 * 1000)).toBe(
      60 * 1000
    );
  });
});

import {
  classInsightRegenerationCooldownMessage,
  getClassInsightRegenerationCooldown,
} from './class-insight-regeneration-cooldown';

export type ClassInsightGenerateAvailability =
  | { canGenerate: true }
  | { canGenerate: false; reason: string };

export function resolveClassInsightGenerateAvailability({
  classInsightsEnabled,
  gradedCount,
  existingInsight = null,
  now = new Date(),
}: {
  classInsightsEnabled: boolean;
  gradedCount: number;
  /** The most recently generated ready summary, if any. */
  existingInsight?: {
    submissionCount: number;
    generatedAt: string | Date | null;
  } | null;
  now?: Date;
}): ClassInsightGenerateAvailability {
  if (!classInsightsEnabled) {
    return {
      canGenerate: false,
      reason:
        "Class performance summaries aren't enabled for your organization.",
    };
  }

  if (gradedCount <= 0) {
    return {
      canGenerate: false,
      reason: 'Grade a few submissions first, then generate class insights.',
    };
  }

  if (existingInsight) {
    const cooldown = getClassInsightRegenerationCooldown(
      existingInsight.generatedAt,
      now
    );
    if (cooldown.inCooldown) {
      return {
        canGenerate: false,
        reason: classInsightRegenerationCooldownMessage(cooldown.remainingMs)!,
      };
    }

    if (gradedCount <= existingInsight.submissionCount) {
      return {
        canGenerate: false,
        reason: 'No new graded submissions since the last summary.',
      };
    }
  }

  return { canGenerate: true };
}

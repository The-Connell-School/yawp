import { useEffect, useState } from 'react';
import { resolveClassInsightGenerateAvailability } from '~/domain/assignment-insights/class-insight-generate-availability';
import {
  classInsightRegenerationCountdownTickMs,
  getClassInsightRegenerationCooldown,
} from '~/domain/assignment-insights/class-insight-regeneration-cooldown';

/**
 * Resolves whether a class insight can be (re)generated right now, ticking
 * on an interval so an active cooldown countdown stays fresh in the UI.
 */
export function useClassInsightGenerateAvailability({
  classInsightsEnabled,
  gradedCount,
  existingInsight,
}: {
  classInsightsEnabled: boolean;
  gradedCount: number;
  existingInsight: {
    submissionCount: number;
    generatedAt: string | null;
  } | null;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const generatedAt = existingInsight?.generatedAt ?? null;
  const cooldown = getClassInsightRegenerationCooldown(
    generatedAt,
    new Date(nowMs)
  );

  useEffect(() => {
    if (!generatedAt || !cooldown.inCooldown) return;

    const tickMs = classInsightRegenerationCountdownTickMs(
      cooldown.remainingMs
    );
    const id = window.setInterval(() => setNowMs(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [generatedAt, cooldown.inCooldown, cooldown.remainingMs]);

  return resolveClassInsightGenerateAvailability({
    classInsightsEnabled,
    gradedCount,
    existingInsight,
    now: new Date(nowMs),
  });
}

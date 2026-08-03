export const CLASS_INSIGHT_REGENERATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

export function getClassInsightRegenerationCooldown(
  generatedAt: string | Date | null | undefined,
  now: Date = new Date()
) {
  if (!generatedAt) {
    return {
      inCooldown: false,
      remainingMs: 0,
      availableAt: null as Date | null,
    };
  }

  const generated =
    typeof generatedAt === 'string' ? new Date(generatedAt) : generatedAt;
  const availableAt = new Date(
    generated.getTime() + CLASS_INSIGHT_REGENERATION_COOLDOWN_MS
  );
  const remainingMs = Math.max(0, availableAt.getTime() - now.getTime());

  return {
    inCooldown: remainingMs > 0,
    remainingMs,
    availableAt: remainingMs > 0 ? availableAt : null,
  };
}

export function formatClassInsightRegenerationWait(remainingMs: number) {
  if (remainingMs <= 0) return null;

  if (remainingMs >= ONE_HOUR_MS) {
    const hours = Math.ceil(remainingMs / ONE_HOUR_MS);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  const minutes = Math.ceil(remainingMs / ONE_MINUTE_MS);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export function classInsightRegenerationCooldownMessage(remainingMs: number) {
  const wait = formatClassInsightRegenerationWait(remainingMs);
  return wait ? `Regenerate in ${wait}.` : null;
}

export function classInsightRegenerationCountdownTickMs(remainingMs: number) {
  return remainingMs >= ONE_HOUR_MS ? ONE_HOUR_MS : ONE_MINUTE_MS;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const STATE_KEY = Symbol.for('yawp.anthropicOutageCircuit');

type AnthropicOutageState = {
  openUntilMs: number;
  openedAtMs: number | null;
  reason: string | null;
};

function getState(): AnthropicOutageState {
  const globalState = globalThis as typeof globalThis & {
    [STATE_KEY]?: AnthropicOutageState;
  };
  globalState[STATE_KEY] ??= {
    openUntilMs: 0,
    openedAtMs: null,
    reason: null,
  };
  return globalState[STATE_KEY];
}

export function getAnthropicOutageTtlMs() {
  const parsed = Number(process.env.ANTHROPIC_OUTAGE_FALLBACK_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

export function isAnthropicOutageCircuitOpen(now = Date.now()) {
  const state = getState();
  return state.openUntilMs > now;
}

export function getAnthropicOutageState(now = Date.now()) {
  const state = getState();
  return {
    isOpen: isAnthropicOutageCircuitOpen(now),
    openUntilMs: state.openUntilMs,
    openedAtMs: state.openedAtMs,
    reason: state.reason,
  };
}

export function markAnthropicOutageOpen({
  reason,
  now = Date.now(),
  ttlMs = getAnthropicOutageTtlMs(),
}: {
  reason: string;
  now?: number;
  ttlMs?: number;
}) {
  const state = getState();
  state.openedAtMs = now;
  state.openUntilMs = now + ttlMs;
  state.reason = reason;
}

export function markAnthropicOutageClosed() {
  const state = getState();
  state.openUntilMs = 0;
  state.openedAtMs = null;
  state.reason = null;
}

export function resetAnthropicOutageForTest() {
  markAnthropicOutageClosed();
}

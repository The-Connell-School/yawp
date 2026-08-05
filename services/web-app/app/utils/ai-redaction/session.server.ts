import { buildRedactionMapping, type RedactionMapping } from './mapping.server';
import { PSEUDONYM_FIRST_NAME_POOL } from './pseudonym-pool.server';

/**
 * A growable redaction mapping for conversations where the full set of
 * real names isn't known up front (e.g. the Reporter chat, where each
 * tool call can surface new student names mid-conversation). Wraps the
 * pure, deterministic `buildRedactionMapping` so every lookup and every
 * later `mapping` snapshot stay consistent with each other.
 *
 * Same lifetime rule as RedactionMapping: in-memory only for one request
 * (or one chat turn's worth of tool calls) - never persisted or logged.
 */
export interface RedactionSession {
  /** Get-or-create the pseudonym for a real name, registering it if new. */
  pseudonymFor(realName: string | null | undefined): string;
  /** Snapshot of every name registered so far, for use with rehydrate(). */
  readonly mapping: RedactionMapping;
}

export function createRedactionSession(
  pool: readonly string[] = PSEUDONYM_FIRST_NAME_POOL
): RedactionSession {
  const registeredNames: string[] = [];
  const registeredKeys = new Set<string>();
  let snapshot = buildRedactionMapping([], pool);

  function pseudonymFor(realNameInput: string | null | undefined): string {
    const realName = realNameInput?.trim();
    if (!realName) return realNameInput ?? '';
    const key = realName.toLowerCase();
    if (!registeredKeys.has(key)) {
      registeredKeys.add(key);
      registeredNames.push(realName);
      snapshot = buildRedactionMapping(registeredNames, pool);
    }
    return snapshot.realToPseudonym.get(key)!.pseudonym;
  }

  return {
    pseudonymFor,
    get mapping() {
      return snapshot;
    },
  };
}

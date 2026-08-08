import {
  buildRedactionMapping,
  withAliasKey,
  type RedactionMapping,
} from './mapping.server';
import { PSEUDONYM_FIRST_NAME_POOL } from './pseudonym-pool.server';
import { firstNameFromFullName } from '~/domain/grading/personalize';

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
  /**
   * Get-or-create the pseudonym for a student's full name (same collision
   * -safe behavior as `pseudonymFor`), and — when unambiguous — also alias
   * their bare first name to the same pseudonym, so first-name-only text
   * authored elsewhere (e.g. a stored grading `overallComment`, which
   * always opens with just the first name) still gets caught by redact()
   * when it's echoed back into a later prompt. See `withAliasKey` for the
   * exact safety rule around students who share a first name.
   */
  registerStudentFullName(fullName: string | null | undefined): string;
  /** Snapshot of every name registered so far, for use with rehydrate(). */
  readonly mapping: RedactionMapping;
}

export function createRedactionSession(
  pool: readonly string[] = PSEUDONYM_FIRST_NAME_POOL
): RedactionSession {
  const registeredNames: string[] = [];
  const registeredKeys = new Set<string>();
  /**
   * First-name aliases added so far, in the order they were claimed.
   * `buildRedactionMapping` is pure and rebuilt from scratch on every new
   * registration, so aliases have to be re-applied afterwards or a later
   * registration silently wipes every alias added before it - which would
   * leave bare first names UNREDACTED (a leak), not merely unaliased.
   */
  const aliases: { alias: string; canonical: string }[] = [];
  let snapshot = buildRedactionMapping([], pool);

  function rebuild() {
    snapshot = buildRedactionMapping(registeredNames, pool);
    for (const { alias, canonical } of aliases) {
      snapshot = withAliasKey(snapshot, alias, canonical);
    }
  }

  function pseudonymFor(realNameInput: string | null | undefined): string {
    const realName = realNameInput?.trim();
    if (!realName) return realNameInput ?? '';
    const key = realName.toLowerCase();
    if (!registeredKeys.has(key)) {
      registeredKeys.add(key);
      registeredNames.push(realName);
      rebuild();
    }
    // No entry means redaction is switched off for this process
    // (AI_PII_REDACTION_ENABLED=false makes buildRedactionMapping return an
    // empty mapping). The kill switch has to degrade to a pass-through, not
    // to a crash, so fall back to the real name.
    return snapshot.realToPseudonym.get(key)?.pseudonym ?? realName;
  }

  function registerStudentFullName(
    fullNameInput: string | null | undefined
  ): string {
    const pseudonym = pseudonymFor(fullNameInput);
    const fullName = fullNameInput?.trim();
    if (!fullName) return pseudonym;

    const firstName = firstNameFromFullName(fullName);
    if (firstName && firstName.toLowerCase() !== fullName.toLowerCase()) {
      const alreadyAliased = aliases.some(
        (entry) => entry.alias.toLowerCase() === firstName.toLowerCase()
      );
      if (!alreadyAliased) {
        aliases.push({ alias: firstName, canonical: fullName });
      }
      rebuild();
    }
    return pseudonym;
  }

  return {
    pseudonymFor,
    registerStudentFullName,
    get mapping() {
      return snapshot;
    },
  };
}

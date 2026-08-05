import { PSEUDONYM_FIRST_NAME_POOL } from './pseudonym-pool.server';

/**
 * A request-scoped, in-memory lookup between real first names and their
 * pseudonyms. MUST NOT be persisted to the database or written to a log —
 * it exists only for the lifetime of one outbound AI call and the
 * rehydration of its response.
 */
export interface RedactionMapping {
  /** lowercased real name -> { pseudonym, canonical original-cased real name } */
  readonly realToPseudonym: ReadonlyMap<
    string,
    { pseudonym: string; realName: string }
  >;
  /** lowercased pseudonym -> canonical original-cased real name */
  readonly pseudonymToReal: ReadonlyMap<string, string>;
}

/** Simple, dependency-free deterministic string hash (FNV-1a, 32-bit). */
function fnv1aHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Builds a deterministic real-name <-> pseudonym mapping for one request.
 *
 * Deterministic: the same input name list always produces the same
 * mapping, which keeps tests and manual audits reproducible.
 *
 * Collision-safe: if two different real names would otherwise hash to the
 * same pseudonym, or a candidate pseudonym happens to collide with one of
 * the real names in this request, linear probing walks the pool until it
 * finds a free, non-colliding slot. Two students who share the same real
 * first name intentionally map to the same pseudonym — that isn't a
 * collision, it's the same identifier.
 */
export function buildRedactionMapping(
  names: ReadonlyArray<string | null | undefined>,
  pool: readonly string[] = PSEUDONYM_FIRST_NAME_POOL
): RedactionMapping {
  const realToPseudonym = new Map<
    string,
    { pseudonym: string; realName: string }
  >();
  const pseudonymToReal = new Map<string, string>();
  const usedPseudonyms = new Set<string>();
  const realNameKeysLower = new Set(
    names
      .map((name) => name?.trim())
      .filter((name): name is string => Boolean(name))
      .map((name) => name.toLowerCase())
  );

  for (const rawName of names) {
    const realName = rawName?.trim();
    if (!realName) continue;
    const key = realName.toLowerCase();
    if (realToPseudonym.has(key)) continue; // shared name -> shared pseudonym

    const poolLength = pool.length;
    const startIndex = fnv1aHash(key) % poolLength;

    let pseudonym: string | undefined;
    for (let probe = 0; probe < poolLength; probe++) {
      const candidate = pool[(startIndex + probe) % poolLength];
      const candidateKey = candidate.toLowerCase();
      if (usedPseudonyms.has(candidateKey)) continue;
      if (realNameKeysLower.has(candidateKey)) continue; // never reuse a real name as a pseudonym
      pseudonym = candidate;
      break;
    }

    // Pool exhausted (more distinct real names in one request than pool
    // entries) - fall back to a suffixed variant of the hashed candidate
    // rather than throwing, so redaction never blocks a grading request.
    if (!pseudonym) {
      const fallbackBase = pool[startIndex % poolLength];
      let suffix = 2;
      let candidate = `${fallbackBase}${suffix}`;
      while (usedPseudonyms.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${fallbackBase}${suffix}`;
      }
      pseudonym = candidate;
    }

    usedPseudonyms.add(pseudonym.toLowerCase());
    realToPseudonym.set(key, { pseudonym, realName });
    pseudonymToReal.set(pseudonym.toLowerCase(), realName);
  }

  return { realToPseudonym, pseudonymToReal };
}

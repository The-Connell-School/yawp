import { PSEUDONYM_FIRST_NAME_POOL } from './pseudonym-pool.server';

/**
 * A request-scoped, in-memory lookup between real first names and their
 * pseudonyms. MUST NOT be persisted to the database or written to a log —
 * it exists only for the lifetime of one outbound AI call and the
 * rehydration of its response.
 */
/**
 * How a registered name part may be matched in PROSE.
 *
 * `primary` — a whole name ("Sophia Martinez") or a first name ("Sophia").
 * Matched on its own, because a first name standing alone in a student's
 * essay is a reference to a person.
 *
 * `secondary` — a name part after the first: a surname or a middle name.
 * NEVER matched standing alone in prose. Surnames are overwhelmingly
 * ordinary English words (Green, Brown, White, Young, King, Long, Price,
 * Cook, Wood, Stone, Hill, Rose, Snow, Frost, Day, Bell, Fields...), and no
 * word list will ever be complete, so keying on the bare word silently
 * corrupts the student's own essay. A secondary part is only substituted
 * when something unambiguous sits next to it — the registered first name
 * ("Marcus Green") or an honorific ("Mr. Green"). See `redact`.
 */
export type NameRole = 'primary' | 'secondary';

export type RedactionNameInput =
  | string
  | null
  | undefined
  | { name: string; role: NameRole };

export interface RedactionMapping {
  /** lowercased real name -> { pseudonym, canonical original-cased real name, role } */
  readonly realToPseudonym: ReadonlyMap<
    string,
    { pseudonym: string; realName: string; role: NameRole }
  >;
  /** lowercased pseudonym -> canonical original-cased real name */
  readonly pseudonymToReal: ReadonlyMap<string, string>;
}

function normalizeNameInput(
  input: RedactionNameInput
): { name: string; role: NameRole } | null {
  if (input == null) return null;
  if (typeof input === 'string') {
    const name = input.trim();
    return name ? { name, role: 'primary' } : null;
  }
  const name = input.name?.trim();
  return name ? { name, role: input.role } : null;
}

/**
 * The name parts of one person that are worth registering for redaction,
 * tagged with how each may be matched.
 *
 * Returns [] when there is no real name. `firstNameFromFullName` falls back
 * to the literal string 'Student' for a nameless account, and registering
 * that sentinel made the ordinary word "student" a redaction key — it was
 * then rewritten inside the teacher's own assignment prompt. 'Student'
 * stays a display/greeting fallback only; it is never a redaction key.
 */
export function redactableNamePartsFromFullName(
  fullName: string | null | undefined
): RedactionNameInput[] {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return [];
  const [first, ...rest] = trimmed.split(/\s+/);
  if (!first) return [];
  return [
    first,
    ...rest.map((part) => ({ name: part, role: 'secondary' as const })),
  ];
}

/**
 * Kill switch for the whole AI PII redaction feature (grading, Reporter,
 * tutor - every caller goes through `buildRedactionMapping`, so gating it
 * here is a single choke point). Defaults ON: only an explicit `'false'`
 * disables it. Flip with `AI_PII_REDACTION_ENABLED=false` if redaction
 * itself is ever suspected of causing a production incident and needs to
 * come out fast, independent of a deploy.
 */
export function isPiiRedactionEnabled(): boolean {
  return process.env.AI_PII_REDACTION_ENABLED !== 'false';
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
  namesInput: ReadonlyArray<RedactionNameInput>,
  pool: readonly string[] = PSEUDONYM_FIRST_NAME_POOL
): RedactionMapping {
  const names = (isPiiRedactionEnabled() ? namesInput : [])
    .map(normalizeNameInput)
    .filter((entry): entry is { name: string; role: NameRole } =>
      Boolean(entry)
    );
  const realToPseudonym = new Map<
    string,
    { pseudonym: string; realName: string; role: NameRole }
  >();
  const pseudonymToReal = new Map<string, string>();
  const usedPseudonyms = new Set<string>();
  const realNameKeysLower = new Set(
    names.map((entry) => entry.name.toLowerCase())
  );

  for (const entry of names) {
    const realName = entry.name;
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
    realToPseudonym.set(key, { pseudonym, realName, role: entry.role });
    pseudonymToReal.set(pseudonym.toLowerCase(), realName);
  }

  return { realToPseudonym, pseudonymToReal };
}

/**
 * Adds an extra lookup key (`aliasRealName`) that resolves to the SAME
 * pseudonym as an already-registered name (`canonicalRealName`).
 *
 * Why this exists: callers that register students by full name (so two
 * students sharing a first name still get distinct, unambiguous pseudonyms
 * — see `pseudonymFor` in session.server.ts) can end up re-sending
 * first-name-only text that was authored elsewhere, e.g. a stored grading
 * `overallComment` that always opens with just the student's first name
 * ("Sophia, you've written..."). `redact()` only matches keys it knows
 * about, so without an alias that bare first name sails through untouched.
 *
 * Safety: if `aliasRealName` is already registered — under this student's
 * own pseudonym or, critically, under a DIFFERENT student's pseudonym
 * because two students share that first name — this is a no-op. A shared
 * first name is genuinely ambiguous (rehydrate() cannot know which student
 * a bare "Alex" refers to), so the alias is only added when it is safe,
 * i.e. the first claimant wins and no later student can steal or overwrite
 * it. A stray unaliased first-name mention in that narrow, documented edge
 * case is not redacted — same trade-off the common-word-name guard makes
 * elsewhere in this module.
 */
export function withAliasKey(
  mapping: RedactionMapping,
  aliasRealName: string,
  canonicalRealName: string
): RedactionMapping {
  const canonicalKey = canonicalRealName.trim().toLowerCase();
  const canonicalEntry = mapping.realToPseudonym.get(canonicalKey);
  if (!canonicalEntry) return mapping;

  const alias = aliasRealName.trim();
  const aliasKey = alias.toLowerCase();
  if (!aliasKey) return mapping;
  if (mapping.realToPseudonym.has(aliasKey)) return mapping;

  const realToPseudonym = new Map(mapping.realToPseudonym);
  realToPseudonym.set(aliasKey, {
    pseudonym: canonicalEntry.pseudonym,
    realName: alias,
    role: 'primary',
  });

  // Point the reverse direction at the alias too, so the round trip is an
  // identity for the form that is actually matched in practice. Without
  // this, "Sophia, you have a strong thesis" redacted to "Harper, you have
  // a strong thesis" and rehydrated to "Sophia MARTINEZ, you have a strong
  // thesis" — every quoted comment silently gaining a surname.
  //
  // One pseudonym now stands for two real forms ("Sophia Martinez" and
  // "Sophia") and rehydrate sees a single token, so it has to pick one. It
  // picks the shorter: it matches the shape of the pseudonym itself (a bare
  // first name), it is what the model was most likely echoing, and it can
  // never fabricate a surname the source text did not have. The cost is
  // that a genuine full-name mention comes back as a first name — a small
  // loss of formality, not corrupted text.
  const pseudonymToReal = new Map(mapping.pseudonymToReal);
  const pseudonymKey = canonicalEntry.pseudonym.toLowerCase();
  const existing = pseudonymToReal.get(pseudonymKey);
  if (!existing || alias.length < existing.length) {
    pseudonymToReal.set(pseudonymKey, alias);
  }
  return { realToPseudonym, pseudonymToReal };
}

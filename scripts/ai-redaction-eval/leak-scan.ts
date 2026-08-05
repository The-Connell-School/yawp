/**
 * Pure name-leak detection helpers for the redaction eval harness.
 *
 * These deliberately do NOT import the app's real `redact`/`rehydrate`
 * regex builder (app/utils/ai-redaction/redact.server.ts) even though the
 * harness elsewhere imports that module directly for the actual
 * redact/rehydrate calls under test. A leak scanner that shared its matching
 * logic with the code it is auditing would only ever confirm the
 * implementation agrees with itself — it needs an independent, intentionally
 * simple whole-word check.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-word, case-insensitive, possessive-aware match of `name` anywhere
 * in `text`. Used both to confirm a real name is absent from an outbound
 * prompt (treatment) and to confirm a pseudonym did not survive
 * rehydration into a final response.
 */
export function containsWholeWordName(text: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || !text) return false;
  const regex = new RegExp(`\\b${escapeRegExp(trimmed)}(['’]s)?\\b`, 'i');
  return regex.test(text);
}

export interface LeakScanResult {
  found: boolean;
  matches: string[];
}

export function scanTextsForName(
  texts: Record<string, string>,
  name: string
): LeakScanResult {
  const matches = Object.entries(texts)
    .filter(([, text]) => containsWholeWordName(text, name))
    .map(([label]) => label);
  return { found: matches.length > 0, matches };
}

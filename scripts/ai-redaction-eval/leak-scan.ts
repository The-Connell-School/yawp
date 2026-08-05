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
export function containsWholeWordName(
  text: string,
  name: string,
  { capitalizedOnly = false }: { capitalizedOnly?: boolean } = {}
): boolean {
  const trimmed = name.trim();
  if (!trimmed || !text) return false;
  // For names that are also ordinary English words (Will, Grace, Rose), a
  // lowercase occurrence in an essay is the common word, not a disclosure
  // of who the student is, and prose redaction deliberately leaves it
  // alone. Scanning case-insensitively there would report a leak on every
  // "will" in a philosophy essay. The report states this narrowing
  // explicitly rather than hiding it behind a green check.
  const capitalized =
    trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  const regex = capitalizedOnly
    ? new RegExp(`\\b${escapeRegExp(capitalized)}(['’]s)?\\b`)
    : new RegExp(`\\b${escapeRegExp(trimmed)}(['’]s)?\\b`, 'i');
  return regex.test(text);
}

export interface LeakScanResult {
  found: boolean;
  matches: string[];
}

export function scanTextsForName(
  texts: Record<string, string>,
  name: string,
  options: { capitalizedOnly?: boolean } = {}
): LeakScanResult {
  const matches = Object.entries(texts)
    .filter(([, text]) => containsWholeWordName(text, name, options))
    .map(([label]) => label);
  return { found: matches.length > 0, matches };
}

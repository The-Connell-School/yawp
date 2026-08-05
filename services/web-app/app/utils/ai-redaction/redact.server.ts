import type { RedactionMapping } from './mapping.server';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mirrors the letter-casing of `sample` onto `target`:
 *  - ALL CAPS sample -> ALL CAPS target
 *  - Title Case sample -> Title Case target
 *  - lower case sample -> lower case target
 *  - anything mixed/irregular -> target returned unchanged
 */
function capitalizeWord(word: string): string {
  return word.length === 0
    ? word
    : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function matchCase(sample: string, target: string): string {
  if (sample.length === 0) return target;
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) {
    return target.toUpperCase();
  }
  if (sample === sample.toLowerCase()) {
    return target.toLowerCase();
  }
  // Title Case: every word starts uppercase, rest lowercase. Apply per-word
  // to `target` independently of how many words `sample` has, so a
  // single-word pseudonym ("Alex") can still correctly case a multi-word
  // real name it stands in for ("Amelia Brooks"), and vice versa.
  const isTitleCase = sample
    .split(' ')
    .every(
      (word) =>
        word.length === 0 ||
        (word[0] === word[0].toUpperCase() &&
          word.slice(1) === word.slice(1).toLowerCase())
    );
  if (isTitleCase) {
    return target.split(' ').map(capitalizeWord).join(' ');
  }
  return target;
}

/**
 * Builds a single case-insensitive, possessive-aware, whole-word regex
 * that matches every key in `names` (real names for redact, pseudonyms
 * for rehydrate). Possessive forms ('s / ’s) are captured separately
 * so only the name portion has its case rewritten.
 */
function buildWholeWordAlternationRegex(names: Iterable<string>): RegExp | null {
  const escaped = Array.from(names, escapeRegExp).filter(Boolean);
  if (escaped.length === 0) return null;
  // Longest first so a name that is a prefix of another doesn't shadow it.
  escaped.sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${escaped.join('|')})(['’]s)?\\b`, 'gi');
}

/**
 * Replaces every real name in `text` with its request-scoped pseudonym,
 * before the text is sent to a third-party AI provider. Case-insensitive
 * and possessive-aware (Maya / MAYA / maya's / Maya’s all match), and
 * mirrors the matched occurrence's letter case onto the pseudonym so the
 * outbound prompt still reads naturally.
 */
export function redact(text: string, mapping: RedactionMapping): string {
  if (!text) return text;
  const realNames = Array.from(
    mapping.realToPseudonym.values(),
    (entry) => entry.realName
  );
  const regex = buildWholeWordAlternationRegex(realNames);
  if (!regex) return text;

  return text.replace(regex, (fullMatch, namePart: string, suffix = '') => {
    const entry = mapping.realToPseudonym.get(namePart.toLowerCase());
    if (!entry) return fullMatch;
    return matchCase(namePart, entry.pseudonym) + suffix;
  });
}

/**
 * Replaces every pseudonym in `text` with the real name it stands in for.
 * Must run on the model's response before that text reaches the UI or is
 * persisted. Robust to the model not echoing the pseudonym's exact casing
 * and to possessive forms, matching the same rules `redact` uses.
 */
export function rehydrate(text: string, mapping: RedactionMapping): string {
  if (!text) return text;
  const pseudonyms = Array.from(mapping.pseudonymToReal.keys()).map(
    (lower) => {
      // Recover a display-cased pseudonym for regex construction; case is
      // irrelevant here because matching is case-insensitive either way.
      for (const entry of mapping.realToPseudonym.values()) {
        if (entry.pseudonym.toLowerCase() === lower) return entry.pseudonym;
      }
      return lower;
    }
  );
  const regex = buildWholeWordAlternationRegex(pseudonyms);
  if (!regex) return text;

  return text.replace(regex, (fullMatch, namePart: string, suffix = '') => {
    const realName = mapping.pseudonymToReal.get(namePart.toLowerCase());
    if (!realName) return fullMatch;
    return matchCase(namePart, realName) + suffix;
  });
}

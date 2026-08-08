import type { RedactionMapping } from './mapping.server';
import { isCommonWordFirstName } from './common-word-names.server';

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

function titleCaseWords(value: string): string {
  return value.split(' ').map(capitalizeWord).join(' ');
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
    return titleCaseWords(target);
  }
  return target;
}

/**
 * Builds a single case-insensitive, possessive-aware, whole-word regex
 * that matches every key in `names` (real names for redact, pseudonyms
 * for rehydrate). Possessive forms ('s / ’s) are captured separately
 * so only the name portion has its case rewritten.
 */
function buildWholeWordAlternationRegex(
  names: Iterable<string>,
  { caseInsensitive = true }: { caseInsensitive?: boolean } = {}
): RegExp | null {
  const escaped = Array.from(names, escapeRegExp).filter(Boolean);
  if (escaped.length === 0) return null;
  // Longest first so a name that is a prefix of another doesn't shadow it.
  escaped.sort((a, b) => b.length - a.length);
  return new RegExp(
    `\\b(${escaped.join('|')})(['’]s)?\\b`,
    caseInsensitive ? 'gi' : 'g'
  );
}

/**
 * `field` (the default) redacts case-insensitively, which is right for the
 * short structured values we control: "Student first name: will" and
 * "Will" are both the student.
 *
 * `prose` is for natural language — anything the student wrote, anything
 * the teacher typed, and any stored free-text comment being replayed into
 * a prompt. It differs from `field` in two ways, both because prose cannot
 * tell a name from a word:
 *
 *  - a first name that is also an ordinary English word must appear
 *    capitalized to be redacted (common-word-names.server.ts);
 *  - a `secondary` name part (surname, middle name) is never matched
 *    standing alone — only next to the first name or after an honorific
 *    (see NameRole in mapping.server.ts).
 *
 * Use `prose` for anything that is not a short value we constructed
 * ourselves. Guessing wrong in that direction costs a missed incidental
 * mention; guessing wrong the other way mangles the text.
 */
export type RedactionMode = 'field' | 'prose';

/**
 * Titles that mark the next capitalized token as a surname. Deliberately
 * short and conventional — this list only ever ADDS substitutions, so an
 * entry that is also an ordinary word would reintroduce the very problem
 * secondary parts exist to avoid.
 */
const HONORIFICS = [
  'Mr',
  'Mrs',
  'Ms',
  'Miss',
  'Mx',
  'Dr',
  'Prof',
  'Professor',
  'Coach',
  'Principal',
];

function replaceNames(
  text: string,
  regex: RegExp | null,
  mapping: RedactionMapping
): string {
  if (!regex) return text;
  return text.replace(regex, (fullMatch, namePart: string, suffix = '') => {
    const entry = mapping.realToPseudonym.get(namePart.toLowerCase());
    if (!entry) return fullMatch;
    return matchCase(namePart, entry.pseudonym) + suffix;
  });
}

/**
 * Replaces every real name in `text` with its request-scoped pseudonym,
 * before the text is sent to a third-party AI provider. Possessive-aware
 * (Maya / MAYA / maya's / Maya’s all match), and mirrors the matched
 * occurrence's letter case onto the pseudonym so the outbound prompt still
 * reads naturally.
 *
 * Pass `{ mode: 'prose' }` for student-authored text such as essay bodies.
 */
export function redact(
  text: string,
  mapping: RedactionMapping,
  { mode = 'field' }: { mode?: RedactionMode } = {}
): string {
  if (!text) return text;
  const realNames = Array.from(
    mapping.realToPseudonym.values(),
    (entry) => entry.realName
  );

  if (mode === 'field') {
    return replaceNames(text, buildWholeWordAlternationRegex(realNames), mapping);
  }

  const primary: string[] = [];
  const secondary: string[] = [];
  for (const entry of mapping.realToPseudonym.values()) {
    (entry.role === 'secondary' ? secondary : primary).push(entry.realName);
  }

  let result = text;

  // Pass 1 — full-name runs: a primary name immediately followed by one or
  // more secondary parts ("Marcus Green", "Sophia Marín Lopez"). Adjacency
  // of two registered parts is unambiguous, so this is case-insensitive and
  // it runs first, before the primary pass can consume the first name and
  // orphan the surname.
  if (primary.length > 0 && secondary.length > 0) {
    const primaryAlt = primary.map(escapeRegExp).sort((a, b) => b.length - a.length);
    const secondaryAlt = secondary
      .map(escapeRegExp)
      .sort((a, b) => b.length - a.length);
    const fullNameRegex = new RegExp(
      `\\b(${primaryAlt.join('|')})((?:[ \\t]+(?:${secondaryAlt.join('|')}))+)(['’]s)?\\b`,
      'gi'
    );
    result = result.replace(
      fullNameRegex,
      (fullMatch, first: string, rest: string, suffix = '') => {
        const firstEntry = mapping.realToPseudonym.get(first.toLowerCase());
        if (!firstEntry) return fullMatch;
        const restReplaced = rest.replace(/\S+/g, (part) => {
          const entry = mapping.realToPseudonym.get(part.toLowerCase());
          return entry ? matchCase(part, entry.pseudonym) : part;
        });
        return matchCase(first, firstEntry.pseudonym) + restReplaced + suffix;
      }
    );
  }

  // Pass 2 — a secondary part after an honorific ("Mr. Green"). The title
  // is what makes the word a name here, so match on it and rewrite only the
  // name that follows.
  if (secondary.length > 0) {
    const secondaryAlt = secondary
      .map((name) => escapeRegExp(capitalizeWord(name)))
      .sort((a, b) => b.length - a.length);
    const honorificRegex = new RegExp(
      `\\b(${HONORIFICS.join('|')})(\\.?[ \\t]+)(${secondaryAlt.join('|')})(['’]s)?\\b`,
      'g'
    );
    result = result.replace(
      honorificRegex,
      (fullMatch, title: string, gap: string, name: string, suffix = '') => {
        const entry = mapping.realToPseudonym.get(name.toLowerCase());
        if (!entry) return fullMatch;
        return title + gap + matchCase(name, entry.pseudonym) + suffix;
      }
    );
  }

  // Pass 3/4 — primary names on their own. Common-word names only match
  // capitalized; everything else stays case-insensitive. Two passes because
  // the two groups need different flags. Secondary parts are deliberately
  // absent from both: on their own they are indistinguishable from ordinary
  // words, and substituting them corrupts the student's own writing.
  const ordinary: string[] = [];
  const commonWord: string[] = [];
  for (const name of primary) {
    (isCommonWordFirstName(name) ? commonWord : ordinary).push(name);
  }

  result = replaceNames(
    result,
    buildWholeWordAlternationRegex(ordinary),
    mapping
  );
  result = replaceNames(
    result,
    buildWholeWordAlternationRegex(
      commonWord.map(capitalizeWord),
      { caseInsensitive: false }
    ),
    mapping
  );
  return result;
}

/**
 * Replaces every pseudonym in `text` with the real name it stands in for.
 * Must run on the model's response before that text reaches the UI or is
 * persisted.
 *
 * CAPITALIZED FORMS ONLY, deliberately. This is the one substitution in
 * this module whose failure modes are asymmetric:
 *
 *  - missing a substitution leaves a pseudonym visible in the UI. Odd, and
 *    self-evident to whoever reads it, but nothing is lost or leaked.
 *  - making one too many rewrites an ordinary English word into a real
 *    student's name, inside feedback that is persisted and shown to the
 *    teacher AND the student. That is silent corruption, and it also
 *    surfaces a real name in a place nobody asked for one.
 *
 * A pseudonym is a proper noun we minted. Every legitimate reference to it
 * in model output is capitalized ("Darcy, your thesis...", or "DARCY" in a
 * shouted heading). An all-lowercase occurrence is, by construction, the
 * ordinary word and not a person - so we leave it alone. The pool is also
 * kept clear of ordinary English words (see pseudonym-pool.server.ts); this
 * rule is the structural guarantee that survives any future pool edit and
 * the `${base}${n}` fallback pseudonyms buildRedactionMapping can invent.
 *
 * Possessive forms are still handled ("Darcy's" / "Darcy’s").
 */
export function rehydrate(text: string, mapping: RedactionMapping): string {
  if (!text) return text;
  const forms = new Set<string>();
  for (const lower of mapping.pseudonymToReal.keys()) {
    // Recover a display-cased pseudonym for regex construction.
    let display = lower;
    for (const entry of mapping.realToPseudonym.values()) {
      if (entry.pseudonym.toLowerCase() === lower) {
        display = entry.pseudonym;
        break;
      }
    }
    forms.add(titleCaseWords(display));
    forms.add(display.toUpperCase());
  }
  const regex = buildWholeWordAlternationRegex(forms, {
    caseInsensitive: false,
  });
  if (!regex) return text;

  return text.replace(regex, (fullMatch, namePart: string, suffix = '') => {
    const realName = mapping.pseudonymToReal.get(namePart.toLowerCase());
    if (!realName) return fullMatch;
    return matchCase(namePart, realName) + suffix;
  });
}

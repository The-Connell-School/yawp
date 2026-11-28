/**
 * Finding companion texts (Kevin, Nov 26): by the work being taught, by a
 * thematic topic, or both. See companion-texts-data.ts.
 */
import { COMPANION_TEXTS, type CompanionText } from './companion-texts-data';
import { visualKitFor } from './work-visuals';

export { COMPANION_TEXTS, type CompanionText } from './companion-texts-data';

const MAX_RESULTS = 6;

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "free will", "Free-will", "time and memory" → the library's topic words. */
function topicKey(topic: string): string {
  const flat = norm(topic);
  if (/\btime\b|\bmemory\b|\bpast\b/.test(flat)) return 'time-memory';
  if (/\bfree\s*will\b|\bfate\b|\bdestiny\b/.test(flat)) return 'free-will';
  return flat.replace(/\s+/g, '-');
}

export type CompanionResult = Omit<CompanionText, 'text' | 'pairsWith'> & {
  /** Whether Yawp! prints it (its whole text comes with it). */
  printable: boolean;
  text?: string;
  /** Why it came up: the work it pairs with, or the topics it shares. */
  matched: string[];
};

/**
 * Companions for a work and/or topics, best first: those that share a topic
 * and pair with the work, then those that pair, then those that share a
 * topic. A work Yawp! has no kit for is matched by its topics alone.
 */
export function searchCompanionTexts(input: { work?: unknown; topics?: unknown; kind?: unknown }): CompanionResult[] {
  const work = typeof input.work === 'string' && input.work.trim() ? visualKitFor(input.work) : null;
  const topics = (Array.isArray(input.topics) ? input.topics : typeof input.topics === 'string' ? [input.topics] : [])
    .filter((topic): topic is string => typeof topic === 'string' && Boolean(topic.trim()))
    .map(topicKey);
  const kind = typeof input.kind === 'string' ? input.kind : null;
  const scored = COMPANION_TEXTS.filter((entry) => !kind || entry.kind === kind)
    // Never the work itself as its own companion.
    .filter((entry) => !(work && norm(entry.title) === norm(work.title)))
    .map((entry) => {
      const shared = entry.topics.filter((topic) => topics.includes(topic));
      const pairs = Boolean(work && entry.pairsWith.includes(work.id));
      return { entry, shared, pairs, score: shared.length * 2 + (pairs ? 3 : 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map(({ entry, shared, pairs }) => {
    const { text, pairsWith: _pairsWith, ...rest } = entry;
    return {
      ...rest,
      printable: Boolean(text),
      ...(text ? { text } : {}),
      matched: [...(pairs && work ? [`pairs with ${work.title}`] : []), ...shared.map((topic) => `topic: ${topic}`)],
    };
  });
}

/** A companion the lesson names, by its title, for printing and checking. */
export function companionNamed(title: string): CompanionText | null {
  const wanted = norm(title.replace(/[“”"]/g, ''));
  if (!wanted) return null;
  return COMPANION_TEXTS.find((entry) => norm(entry.title.replace(/[“”"]/g, '')) === wanted || norm(entry.title).startsWith(wanted)) ?? null;
}

/** The held companions a reply uses: named in it with a line of their text quoted. */
export function companionsUsed(reply: string): CompanionText[] {
  const flat = norm(reply);
  return COMPANION_TEXTS.filter((entry) => {
    if (!entry.text) return false;
    if (!flat.includes(norm(entry.title.replace(/[“”"]/g, '')))) return false;
    // At least one whole line of the poem appears: the poem is quoted, not just named.
    return entry.text.split('\n').some((line) => {
      const words = norm(line);
      return words.split(' ').length >= 4 && flat.includes(words);
    });
  });
}

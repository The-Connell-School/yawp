/**
 * The source texts quotations are checked against (Nov 22; lesson review,
 * pattern 2: in 13 of 13 lessons a quotation or a fact was written from
 * memory, and Owen's "Dulce et Decorum Est" went to students with lines that
 * are not in the poem). A small registry of the public-domain works high
 * school English teaches most (source-texts-data.ts), the work a lesson is
 * about read off its words, and the work's Project Gutenberg plain text,
 * fetched once and kept.
 */
import { SOURCE_TEXT_WORKS, type RegisteredWork } from './source-texts-data';

export { SOURCE_TEXT_WORKS, type RegisteredWork } from './source-texts-data';

export const gutenbergTextUrl = (id: number) =>
  `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;

/**
 * Where else the same file is (Project Gutenberg's own mirrors), tried in turn
 * when gutenberg.org will not answer a server (re-test, Nov 22: no text was
 * had on the preview for any of the 13 lessons).
 */
export const gutenbergTextUrls = (id: number) => [
  gutenbergTextUrl(id),
  // The same file by its other address (round 3: gutenberg.org answered 503 for Owen's poems).
  `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
  `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.txt`,
  `https://aleph.pglaf.org/cache/epub/${id}/pg${id}.txt`,
];

// Why the last fetch of each work failed (a status, "timeout", "not the work"), for the planner's counts.
const failures = new Map<string, string>();

/** Why the work's text could not be had last time, or null. No lesson text: a status word. */
export function sourceTextFailure(work: RegisteredWork): string | null {
  return failures.get(work.id) ?? null;
}

/** The registered work by id, or null. */
export function registeredWork(id: string): RegisteredWork | null {
  return SOURCE_TEXT_WORKS.find((work) => work.id === id) ?? null;
}

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A name as a whole-word pattern. One word is matched as written ("Futility",
 * "Birches", "Dracula": capitalized, or it is the ordinary word); a title of
 * two words or more in any case. Straight and curly apostrophes alike.
 */
function namePattern(name: string): RegExp {
  const body = escapeRegex(name).replace(/['’]/g, "['’]");
  const flags = /\s/.test(name.trim()) ? 'gi' : 'g';
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`,
    `${flags}u`
  );
}

const PATTERNS = new Map<string, RegExp[]>(
  SOURCE_TEXT_WORKS.map((work) => [work.id, work.names.map(namePattern)])
);

/** The lines that say what a lesson is: its first heading, and the deck's title and subtitle. */
function headingText(text: string): string {
  const heading = text.match(/^#{1,2}\s+(.+)$/m)?.[1] ?? '';
  const deck = [
    ...text.matchAll(/"(?:title|subtitle|unit)"\s*:\s*"([^"]{1,200})"/g),
  ]
    .slice(0, 3)
    .map((match) => match[1]);
  return [heading, ...deck].join('\n');
}

/**
 * The registered work a lesson (or a teacher's request) is about, read off
 * its words: the work whose names it uses most, a name in the lesson's own
 * heading counting for five. Null when none is named at least twice, or once
 * in the heading: a lesson on a work not registered (Their Eyes Were Watching
 * God, 1984) is never checked against another one it mentions in passing.
 */
export function workForText(text: string, { mentions = 2 }: { mentions?: number } = {}): RegisteredWork | null {
  if (!text) return null;
  const heading = headingText(text);
  let best: { work: RegisteredWork; score: number } | null = null;
  for (const work of SOURCE_TEXT_WORKS) {
    const patterns = PATTERNS.get(work.id) ?? [];
    let score = 0;
    for (const pattern of patterns) {
      score += text.match(pattern)?.length ?? 0;
      if (heading && heading.match(pattern)) score += 5;
    }
    if (score >= mentions && (!best || score > best.score)) best = { work, score };
  }
  return best?.work ?? null;
}

/** A Project Gutenberg file without its license header and footer. */
export function stripGutenberg(text: string): string {
  let body = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const start = body.match(
    /^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E(?:-)?BOOK[^\n]*$/im
  );
  if (start?.index !== undefined)
    body = body.slice(start.index + start[0].length);
  const end = body.match(
    /^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E(?:-)?BOOK[^\n]*$/im
  );
  if (end?.index !== undefined) body = body.slice(0, end.index);
  // Older files end with the license instead of an END line.
  const license = body.search(/^End of (?:the )?Project Gutenberg(?:'s)? /im);
  if (license > 0) body = body.slice(0, license);
  return body.trim();
}

const lettersOf = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Whether the text is the work: it holds the work's own check phrase. */
export function isTextOfWork(text: string, work: RegisteredWork): boolean {
  return lettersOf(text).includes(lettersOf(work.check));
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 6_000;
const CACHE_SIZE = 8;
const MIN_LENGTH = 1_000;
const MAX_BYTES = 8 * 1024 * 1024;

// Most recently used last. A failed fetch is not kept: the next lesson tries again.
const cache = new Map<string, Promise<string | null>>();

/** Forget every fetched text (tests). */
export function clearSourceTextCache() {
  cache.clear();
}

async function fetchText(
  work: RegisteredWork,
  fetcher: Fetch,
  timeoutMs: number
): Promise<string | null> {
  const why: string[] = [];
  for (const url of gutenbergTextUrls(work.gutenbergId)) {
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'text/plain' },
      });
      if (!response.ok) {
        why.push(`${new URL(url).hostname} ${response.status}`);
        continue;
      }
      const raw = await response.text();
      if (raw.length > MAX_BYTES) return null;
      const text = stripGutenberg(raw);
      if (text.length < MIN_LENGTH || !isTextOfWork(text, work)) {
        // A page that is not the book (an error page served as 200: the
        // preview, Nov 22): the next address may have it.
        why.push(`${new URL(url).hostname} not the work`);
        continue;
      }
      failures.delete(work.id);
      return text;
    } catch (error) {
      why.push(`${new URL(url).hostname} ${error instanceof Error && /abort|timeout/i.test(error.name + error.message) ? 'timeout' : 'error'}`);
    }
  }
  failures.set(work.id, why.join(', ').slice(0, 160));
  return null;
}

/**
 * The work's plain text, its Gutenberg header and footer removed, or null
 * (no answer in time, not found, or not the work). Kept in memory, the last
 * eight works; a text that could not be fetched is asked for again next time.
 */
export async function fetchWorkText(
  work: RegisteredWork,
  {
    fetch: fetcher = globalThis.fetch as Fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { fetch?: Fetch; timeoutMs?: number } = {}
): Promise<string | null> {
  const kept = cache.get(work.id);
  if (kept) {
    cache.delete(work.id);
    cache.set(work.id, kept);
    return kept;
  }
  const pending = fetchText(work, fetcher, timeoutMs).then((text) => {
    if (text === null) cache.delete(work.id);
    return text;
  });
  cache.set(work.id, pending);
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return pending;
}

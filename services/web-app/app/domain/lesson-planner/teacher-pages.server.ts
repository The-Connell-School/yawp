/**
 * The teacher's own pages (plan item 12, Nov 23). A work in copyright has no
 * text Yawp! may fetch, and without one the planner quotes from memory: in
 * the new-lesson tests the five lessons without their text averaged 2.20,
 * the four with it 3.00, and every invented quotation was in the five.
 *
 * When the teacher adds the pages (a PDF, a photo, pasted text), they are the
 * text: every quotation is checked against them, corrected to them, and the
 * excerpt slides print them. And every lesson that quotes says what its
 * quotations were checked against, or that they were not, and how to fix it.
 */
import { prepareSource, type PreparedSource } from './quotation-check.server';
import type { LessonUpload } from './lesson-uploads';
import type { RegisteredWork } from './source-texts-data';
import { readSlideDeck } from './slide-deck';

/** Fewer words than this is a note or a prompt, not a passage. */
const MIN_PAGE_WORDS = 60;

export type TeacherPages = {
  work: RegisteredWork;
  source: PreparedSource;
  /** The documents' names, as the teacher sees them. */
  names: string[];
};

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * The teacher's uploaded pages as a text to check against: every document of
 * theirs on this lesson that is not a slide deck, run together. Checked as
 * a run of pages (no chapters or acts: a few pages carry a running head that
 * would read as one), so a quotation is found or not, never "misplaced".
 */
export function teacherPages(
  uploads: ReadonlyArray<Pick<LessonUpload, 'id' | 'name' | 'text' | 'keptDeck'>>
): TeacherPages | null {
  const pages = uploads.filter((upload) => !upload.keptDeck && typeof upload.text === 'string' && wordCount(upload.text) >= MIN_PAGE_WORDS);
  if (!pages.length) return null;
  const names = pages.map((upload) => upload.name.trim()).filter(Boolean);
  const named = names.length === 1 ? names[0]! : `${names.length} documents`;
  return {
    names,
    source: prepareSource(pages.map((upload) => upload.text).join('\n\n'), 'poems'),
    work: {
      id: `pages:${pages.map((upload) => upload.id).join(',')}`,
      title: 'your pages',
      author: '',
      gutenbergId: 0,
      structure: 'poems',
      names: [],
      check: '',
      edition: `your pages (${named})`,
    },
  };
}

export type CheckedAgainst =
  | { kind: 'pages'; work: RegisteredWork; source: PreparedSource; names: string[] }
  | { kind: 'registered'; work: RegisteredWork }
  /** A text Yawp! holds whose copy could not be had in time (Gutenberg refusing, Nov 23). */
  | { kind: 'unavailable'; work: RegisteredWork }
  | { kind: 'none' };

/**
 * Which text the lesson's quotations are checked against. A public-domain
 * text Yawp! holds whole comes first (not a translation: the class may read
 * another, and the teacher's pages are theirs); then the teacher's pages, which are
 * the edition their students hold (and better than a text kept only to
 * verify, such as Dickinson's 1890 editors or Homer in Butler); then that.
 */
export function chooseCheckedAgainst(registered: RegisteredWork | null, pages: TeacherPages | null): CheckedAgainst {
  // A translation is one of several: the class's own (the teacher's pages) comes first.
  if (registered && !registered.verifyOnly && !(registered.translated && pages)) return { kind: 'registered', work: registered };
  if (pages) return { kind: 'pages', ...pages };
  if (registered) return { kind: 'registered', work: registered };
  return { kind: 'none' };
}

const FENCE = /^\s*(```|~~~)/;

/**
 * Quotations of six words or more in what students read: the lesson's prose
 * and its handouts. Not the deck (its passages count on their own), and not
 * the starters, exit tickets, practice or unit maps, whose quotation marks
 * hold prompts, not the work (Kevin, Nov 23: a unit map was labeled "not
 * checked" for its class-starter prompts).
 */
function quotedPassages(reply: string): number {
  const text = reply.replace(/```(yawp-[a-z-]+)[\s\S]*?```/g, (block, kind: string) => (kind === 'yawp-material' ? block : ' '));
  return [...text.matchAll(/[“"]([^“”"\n]{8,600})[”"]/g)].filter((m) => wordCount(m[1]!) >= 6).length;
}

/** What the lesson's excerpt and reading slides name as their work ("Their Eyes Were Watching God"). */
export function workNamedOnSlides(reply: string): string | null {
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck') return null;
  for (const slide of outcome.deck.slides)
    if ((slide.layout === 'excerpt' || slide.layout === 'read') && slide.work?.trim()) return slide.work.trim();
  return null;
}

/** Whether a work is read on the slides: an excerpt, or a reading slide that names its work. */
function readsAWork(reply: string): boolean {
  const outcome = readSlideDeck(reply);
  return outcome.kind === 'deck' && outcome.deck.slides.some((slide) => slide.layout === 'excerpt' || (slide.layout === 'read' && Boolean(slide.work)));
}

/** Whether the lesson reads from a text: an excerpt or reading slide, or quotations in its words. */
export function lessonQuotes(reply: string): boolean {
  // A unit map assigns reading; it quotes nothing until a day is built.
  if (/```yawp-unit/.test(reply) && !/```yawp-(?:slides|material)/.test(reply)) return false;
  const outcome = readSlideDeck(reply);
  const readsOnSlides = outcome.kind === 'deck' && outcome.deck.slides.some((slide) => slide.layout === 'excerpt' || (slide.layout === 'read' && Boolean(slide.work)));
  return readsOnSlides || quotedPassages(reply) > 0;
}

const QUOTATIONS_MARK = /\bQuotations (?:not checked|checked against)\b/;
const CHECK_NOTE = '**Check before class:**';

/**
 * One short line in every lesson that quotes, saying what its quotations were
 * checked against (Kevin, Nov 23: teachers must know when to give us the
 * text). At the end, with what to check before class: it is a caveat, not
 * the lesson's opening (Kevin, Nov 23: "quotations feels like a caveat that
 * should be somewhere else").
 */
export function withQuotationsLabel(
  reply: string,
  checked: CheckedAgainst,
  /** `verified` counts every quotation found, the corrected ones too (as the check counts them). */
  counts: { verified: number; corrected: number; unverified: number }
): string {
  if (QUOTATIONS_MARK.test(reply) || !lessonQuotes(reply)) return reply;
  // A lesson with no work at its center (a grammar or argument lesson whose
  // examples Yawp! wrote) has nothing to check against: no line (types test, Nov 24).
  if (checked.kind === 'none' && !readsAWork(reply)) return reply;
  let line: string;
  if (checked.kind === 'unavailable') {
    line = `Quotations not checked: Yawp! couldn’t get its copy of *${checked.work.title}* in time. Add your pages with the paperclip and they will be.`;
  } else if (checked.kind === 'none') {
    const work = workNamedOnSlides(reply);
    line = `Quotations not checked: Yawp! doesn’t have ${work ? `*${work}*` : 'this text'}. Add your pages with the paperclip (a PDF, a photo or pasted text) and they will be.`;
  } else {
    const against =
      checked.kind === 'pages'
        ? `your pages (${checked.names.length === 1 ? checked.names[0] : checked.names.join(', ')})`
        : `${checked.work.title}, ${checked.work.edition}${checked.work.verifyOnly ? ', checked but not corrected, since your edition may differ' : ''}`;
    const parts = [
      `${counts.verified} found`,
      ...(counts.corrected ? [`${counts.corrected} corrected to match`] : []),
      ...(counts.unverified ? [`${counts.unverified} not found in it`] : []),
    ];
    line = `Quotations checked against ${against}: ${parts.join('; ')}.`;
  }
  return withLineInCheckNote(reply, line);
}

/** The last item of "Check before class" when the lesson has one; else one quiet line at the end. */
function withLineInCheckNote(reply: string, line: string): string {
  const lines = reply.split('\n');
  const at = lines.findIndex((text) => text.trim() === CHECK_NOTE);
  if (at >= 0) {
    let end = at + 1;
    while (end < lines.length && /^\s*-\s/.test(lines[end]!)) end += 1;
    return [...lines.slice(0, end), `- ${line}`, ...lines.slice(end)].join('\n');
  }
  return withLineAtEnd(reply, `*${line}*`);
}

/** Before the closing question, when the reply ends on one; otherwise at the end (as "Check before class"). */
function withLineAtEnd(reply: string, line: string): string {
  const lines = reply.split('\n');
  let inFence = false;
  let lastText = -1;
  lines.forEach((text, index) => {
    if (FENCE.test(text)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && text.trim()) lastText = index;
  });
  if (lastText >= 0 && lines[lastText]!.trim().endsWith('?')) {
    return [...lines.slice(0, lastText), line, '', ...lines.slice(lastText)].join('\n');
  }
  return `${reply.trimEnd()}\n\n${line}\n`;
}

/** For tests. */
export const quotedPassagesIn = quotedPassages;

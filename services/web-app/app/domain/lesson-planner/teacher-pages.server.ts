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
  | { kind: 'none' };

/**
 * Which text the lesson's quotations are checked against. A public-domain
 * text Yawp! holds whole comes first; then the teacher's pages, which are
 * the edition their students hold (and better than a text kept only to
 * verify, such as Dickinson's 1890 editors or Homer in Butler); then that.
 */
export function chooseCheckedAgainst(registered: RegisteredWork | null, pages: TeacherPages | null): CheckedAgainst {
  if (registered && !registered.verifyOnly) return { kind: 'registered', work: registered };
  if (pages) return { kind: 'pages', ...pages };
  if (registered) return { kind: 'registered', work: registered };
  return { kind: 'none' };
}

const FENCE = /^\s*(```|~~~)/;

/** Quotations of six words or more in the reply's prose and materials ("…", “…”). */
function quotedPassages(reply: string): number {
  const text = reply.replace(/```yawp-slides[\s\S]*?```/g, ' ');
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

/** Whether the lesson reads from a text: an excerpt or reading slide, or quotations in its words. */
export function lessonQuotes(reply: string): boolean {
  const outcome = readSlideDeck(reply);
  const readsOnSlides = outcome.kind === 'deck' && outcome.deck.slides.some((slide) => slide.layout === 'excerpt' || (slide.layout === 'read' && Boolean(slide.work)));
  return readsOnSlides || quotedPassages(reply) > 0;
}

const QUOTATIONS_LABEL = '**Quotations:**';

/**
 * One line in every lesson that quotes, saying what its quotations were
 * checked against (Kevin, Nov 23: teachers must know when to give us the
 * text). Checked: where, and what was found. Not checked: why, and the one
 * thing that fixes it, placed at the top where it is read before the lesson.
 */
export function withQuotationsLabel(
  reply: string,
  checked: CheckedAgainst,
  /** `verified` counts every quotation found, the corrected ones too (as the check counts them). */
  counts: { verified: number; corrected: number; unverified: number }
): string {
  if (reply.includes(QUOTATIONS_LABEL) || !lessonQuotes(reply)) return reply;
  if (checked.kind === 'none') {
    const work = workNamedOnSlides(reply);
    const line = `${QUOTATIONS_LABEL} not checked. Yawp! doesn’t have ${work ? `*${work}*` : 'this text'}, so nothing it quotes here has been checked against the book. Add your pages with the paperclip below (a PDF, a photo of the pages, or the text pasted in) and every quotation will be checked against your copy and the passage printed from it.`;
    return withLineAtTop(reply, line);
  }
  const against =
    checked.kind === 'pages'
      ? `your pages (${checked.names.length === 1 ? checked.names[0] : checked.names.join(', ')})`
      : `${checked.work.title}, ${checked.work.edition}${checked.work.verifyOnly ? ', checked but not corrected, since your edition may differ' : ''}`;
  const parts = [
    `${counts.verified} found`,
    ...(counts.corrected ? [`${counts.corrected} corrected to match`] : []),
    ...(counts.unverified ? [`${counts.unverified} not found, listed under “Check before class” if the lesson relies on them`] : []),
  ];
  return withLineAtEnd(reply, `${QUOTATIONS_LABEL} checked against ${against}: ${parts.join('; ')}.`);
}

/** After the reply's opening heading, if it has one; else first. */
function withLineAtTop(reply: string, line: string): string {
  const lines = reply.split('\n');
  const first = lines.findIndex((text) => text.trim());
  if (first >= 0 && /^#{1,3}\s/.test(lines[first]!) && !FENCE.test(lines[first]!)) {
    return [...lines.slice(0, first + 1), '', line, '', ...lines.slice(first + 1)].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  return `${line}\n\n${reply.trimStart()}`;
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

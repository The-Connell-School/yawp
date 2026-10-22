/**
 * The teacher's lesson plan to the Yawp! Lesson Deck Kit's lesson plan spec
 * v1 ("The plan behind the deck"): the same name, painting color and fonts as
 * the deck, read like a handbook page. Short labeled sections up top, then
 * numbered steps that name the slides to have up.
 *
 * This is the spec's data model, one record per lesson; kit-plan-render
 * turns it into the Word file and the PDF. Built from the concise plan
 * (lesson-plan-doc.ts) and the lesson's deck, when it has one.
 */
import { deckArt } from './deck-art';
import { deckColors, normalizedHex, withoutColorMarks } from './deck-colors';
import { WRITING_PROCESS_STEPS, withoutLessonNumber } from './deck-gallery';
import type { LessonPlanDoc, LessonPlanEntry, LessonPlanStep } from './lesson-plan-doc';
import { readSlideDeck, type SlideDeck } from './slide-deck';
import { upperKeepingBrand } from '~/domain/brand';

export type KitListItem = string | { t: string; sub: string[] };

export type KitBlock =
  | { type: 'callout'; title: string; paras: string[] }
  | { type: 'h2'; text: string }
  | { type: 'twoCol'; cols: Array<[string, string[]]> }
  /** The standards the teacher named, when any; the box has room for more. */
  | { type: 'standards'; items?: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'phase'; text: string }
  | {
      type: 'step';
      num: string;
      title: string;
      minutes?: number | null;
      /** The deck's slides for this step, by name, joined with dots. */
      slides?: string;
      paras: string[];
      items?: KitListItem[];
      after?: KitBlock[];
    }
  | { type: 'quote'; text: string };

export type KitPlan = {
  /** The deck's primary color, as six hex digits. */
  accent: string;
  /** The deck's colors, for color-coded examples. */
  colors: string[];
  kicker: string;
  title: string;
  subtitle: string | null;
  /** "[Lesson] lesson plan", between the program and the page number. */
  footer: string;
  meta: Array<[string, string]>;
  body: KitBlock[];
};

export const KIT_PLAN_PROGRAM = 'Yawp! Writing Program';
export const KIT_PLAN_STANDARDS_PLACEHOLDER = '[ Add the standards this lesson covers ]';
export const KIT_PLAN_MORE_STANDARDS = '[ Add any others this lesson covers ]';

const PROCESS_NAMES: Record<(typeof WRITING_PROCESS_STEPS)[number], string> = {
  'pre-writing': 'pre-writing',
  thesis: 'thesis',
  introduction: 'introduction',
  'body paragraphs': 'body paragraphs',
  conclusion: 'conclusion',
  'title and format': 'title and format',
};

/** The lesson's deck, from the stack. */
function deckFrom(entries: LessonPlanEntry[]): SlideDeck | null {
  for (const entry of entries) {
    if (entry.kind !== 'slides') continue;
    const outcome = readSlideDeck(entry.content);
    if (outcome.kind === 'deck') return outcome.deck;
  }
  return null;
}

/** The part of the lesson a step belongs to (spec: Lesson steps, Phase label). */
function phaseOf(step: LessonPlanStep, closing: boolean): string {
  if (closing) return 'Closing';
  if (step.kind === 'class-starter') return 'Opening activity';
  if (step.kind === 'daily-pages' || step.kind === 'practice') return 'Writing activity';
  return 'The lesson';
}

const STUDENTS_WILL = /^\s*students will\s*/i;
const TEACHER_WILL = /^\s*(?:the )?teacher will\s*/i;

function slidesFor(deck: SlideDeck | null, piece: number | undefined): string | undefined {
  if (!deck || !piece) return undefined;
  const names = deck.slides
    .filter((slide) => slide.step === piece && slide.layout !== 'title')
    .map((slide) => withoutColorMarks(slide.title).trim())
    .filter(Boolean);
  return names.length ? [...new Set(names)].join(' · ') : undefined;
}

function stepBlock(step: LessonPlanStep, num: number, deck: SlideDeck | null): KitBlock {
  const title = (step.shortTitle || step.title).trim();
  const paras = [step.summary, step.purpose ? `*Why:* ${step.purpose}` : '']
    .map((text) => text.trim())
    .filter(Boolean);
  if (step.optional && paras.length) paras[0] = `*Optional:* ${paras[0]}`;
  else if (step.optional) paras.push('*Optional.*');
  const slides = slidesFor(deck, step.piece);
  return {
    type: 'step',
    num: String(num),
    title,
    minutes: step.minutes,
    ...(slides ? { slides } : {}),
    paras,
  };
}

export function buildKitPlan({ doc, entries }: { doc: LessonPlanDoc; entries: LessonPlanEntry[] }): KitPlan {
  const deck = deckFrom(entries);
  const colors = deckColors(deck ?? {}, deck ? deckArt(deck.art) : null);
  const accent = colors[0]!.replace('#', '').toUpperCase();
  const title = withoutLessonNumber(deck?.title ?? doc.title);
  const titleSlide = deck?.slides.find((slide) => slide.layout === 'title');
  const subtitle = titleSlide?.subtitle ? withoutColorMarks(titleSlide.subtitle) : null;

  const meta: Array<[string, string]> = [];
  const processStep = deck?.slides.find((slide) => slide.layout === 'divider' && slide.processStep)?.processStep;
  if (processStep) {
    meta.push(['Step', `${processStep} of the writing process: ${PROCESS_NAMES[WRITING_PROCESS_STEPS[processStep - 1]!]}`]);
  } else if (doc.className || doc.periodMinutes) {
    meta.push(['Class', [doc.className, doc.periodMinutes ? `${doc.periodMinutes} minutes` : null].filter(Boolean).join(' · ')]);
  }
  const deckName = deck ? withoutLessonNumber(deck.title) : null;
  if (deckName) meta.push(['Slide deck', deckName]);
  meta.push(['Platform', 'yawp.school']);

  const goals = doc.goals.map((goal) => goal.replace(STUDENTS_WILL, '').trim()).filter(Boolean);
  const teacherWill = doc.teacherWill.map((line) => line.replace(TEACHER_WILL, '').trim()).filter(Boolean);
  const cols: Array<[string, string[]]> = [['Students will…', goals]];
  if (teacherWill.length) cols.push(['The teacher will…', teacherWill]);

  const materials = doc.materials.map((item) => (item.startsWith('Slide deck:') && deckName ? `Slide deck: ${deckName}` : item));
  if (deckName && !materials.some((item) => item.startsWith('Slide deck'))) materials.unshift(`Slide deck: ${deckName}`);
  materials.push('Student access to yawp.school');

  const body: KitBlock[] = [
    { type: 'callout', title: 'Overview', paras: [doc.overview] },
    { type: 'h2', text: 'Goals' },
    { type: 'twoCol', cols },
    doc.standards?.length ? { type: 'standards', items: doc.standards } : { type: 'standards' },
    { type: 'h2', text: 'Materials' },
    { type: 'bullets', items: [...new Set(materials)] },
    { type: 'h2', text: 'Lesson steps' },
  ];

  const steps = [
    ...doc.instructions.map((step) => ({ step, closing: false })),
    ...(doc.closingStep ? [{ step: doc.closingStep, closing: true }] : []),
  ];
  // Phase labels only when the lesson has distinct parts.
  const phases = new Set(steps.map(({ step, closing }) => phaseOf(step, closing)));
  let phase: string | null = null;
  steps.forEach(({ step, closing }, index) => {
    const next = phaseOf(step, closing);
    if (phases.size > 1 && next !== phase) body.push({ type: 'phase', text: next });
    phase = next;
    body.push(stepBlock(step, index + 1, deck));
  });
  if (!doc.closingStep) body.push({ type: 'callout', title: 'Suggested closing', paras: [doc.closing.replace(/^Suggested closing: not in your stack\.\s*/, '')] });

  return {
    accent,
    colors,
    kicker: upperKeepingBrand(['Yawp! Lesson Plan', deck?.unit].filter(Boolean).join(' · ')),
    title,
    subtitle,
    footer: `${title} lesson plan`,
    meta,
    body,
  };
}

export type KitRun = { text: string; bold?: true; italic?: true; color?: string };

const MARK = /\*\*([^*]+)\*\*|\*([^*]+)\*|~~(#?[0-9A-Fa-f]{6}|[1-3])\|([^~]+)~~/g;

/** Inline marks: `**bold**`, `*italic*`, `~~HEX|colored~~` or `~~N|…~~` for a deck color. */
export function kitRuns(text: string, colors: string[] = []): KitRun[] {
  const runs: KitRun[] = [];
  let at = 0;
  for (const match of text.matchAll(MARK)) {
    if (match.index! > at) runs.push({ text: text.slice(at, match.index) });
    if (match[1]) runs.push({ text: match[1], bold: true });
    else if (match[2]) runs.push({ text: match[2], italic: true });
    else {
      const key = match[3]!;
      const hex = /^[1-3]$/.test(key) ? colors[Number(key) - 1] : normalizedHex(key);
      runs.push(hex ? { text: match[4]!, color: hex.replace('#', '').toUpperCase() } : { text: match[4]! });
    }
    at = match.index! + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}

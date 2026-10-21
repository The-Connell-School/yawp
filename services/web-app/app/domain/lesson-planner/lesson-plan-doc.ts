/**
 * The lesson plan as a teacher hands it in (Brian's run 2, D1; items 28, 29,
 * 32).
 *
 * The old export reproduced everything in the stack — every framing in full,
 * every prompt, the handouts, the slide list — and ran for pages. Brian's
 * model is the Yawp! pre-writing lesson plan: Overview, Goals, Teacher will,
 * Materials, numbered Instructions, a closing. Each part of the lesson gets a
 * short summary of what happens and what it is for; the full texts live in the
 * handouts and the deck. Only what is in the stack appears, in its order.
 */
import { createHash } from 'node:crypto';
import { fenceSlideDeck, readSlideDeck } from './slide-deck';
import type { LessonPacket } from './lesson-packet';
import { readPlanSteps } from './plan-steps';
import { hidePromptIds } from './prompt-ids';

/** One piece of the stack, in stack order. */
export type LessonPlanEntry = {
  /** A material kind (`step`, `notes`, `class-starter`, …) or `lesson` for a kept reply. */
  kind: string;
  title: string;
  content: string;
  /** Its number in the stack, the one a deck's slides carry as `step`. */
  piece?: number;
};

export type LessonPlanStep = {
  title: string;
  minutes: number | null;
  /** What happens, in a sentence or two. */
  summary: string;
  /** Why this step serves the lesson. */
  purpose: string;
  /** Two to six words that say what happens (lesson plan spec v1). */
  shortTitle?: string;
  /** Marked "Optional:" in the plan. */
  optional?: boolean;
  /** The stack piece this step comes from, and its kind. */
  piece?: number;
  kind?: string;
};

export type LessonPlanDoc = {
  title: string;
  className: string | null;
  periodMinutes: number | null;
  overview: string;
  goals: string[];
  teacherWill: string[];
  materials: string[];
  instructions: LessonPlanStep[];
  closing: string;
  /**
   * The stack's own closing step, which is the Closing section and is not
   * listed again under Instructions (Brian's run 3, item 12). Null when the
   * stack has none.
   */
  closingStep: LessonPlanStep | null;
  closingInStack: boolean;
  /** Prefilled from the exit ticket or Daily Pages in the stack, when any. */
  assessment: string | null;
};

/** What the model writes for a plan (see plan-summary.server.ts). */
export type LessonPlanSummaries = {
  overview?: string;
  goals?: string[];
  teacherWill?: string[];
  /** One per instruction, in order. */
  steps?: Array<{ summary: string; purpose: string; title?: string; optional?: boolean }>;
  closing?: string;
};

const MAX_SUMMARY_CHARS = 220;

/** What a writing piece or framing is for, when nothing better was written. */
const DEFAULT_PURPOSE: Record<string, string> = {
  'class-starter':
    'Gets every student writing in the first minutes, so the lesson starts from their own thinking.',
  'daily-pages':
    'A graded reflection that asks students to back up what they think.',
  'exit-ticket':
    'Shows you, before they leave, who has today’s idea and who needs it again.',
  notes: 'Gives students the context they need to enter today’s reading.',
  practice:
    'Practice on one sentence-level skill, worked in Yawp! with results for you.',
  handout: 'What students hold and write on while they work.',
  sample: 'A model students can see before they try it themselves.',
};

const MINUTES = /\(\s*(\d{1,3})\s*(?:[–—-]\s*(\d{1,3})\s*)?min(?:utes?)?\s*\)/i;

function splitTitle(raw: string): { title: string; minutes: number | null } {
  const match = MINUTES.exec(raw);
  return {
    title: (match ? raw.replace(match[0], '') : raw)
      .replace(/\s{2,}/g, ' ')
      .trim(),
    minutes: match ? Number(match[2] ?? match[1]) : null,
  };
}

/** Plain text from Markdown, for a summary. */
function plain(markdown: string): string {
  return hidePromptIds(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\|.*\|$/gm, ' ')
    .replace(/[*_`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first sentence or so, never the whole text. */
function firstSentences(markdown: string): string {
  const text = plain(markdown);
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [text];
  let summary = '';
  for (const sentence of sentences) {
    const next = `${summary} ${sentence.trim()}`.trim();
    if (next.length > MAX_SUMMARY_CHARS) break;
    summary = next;
    if (summary.length > 90) break;
  }
  if (!summary) summary = `${text.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…`;
  return summary;
}

/** "Class Starter: What do you carry?" → "What do you carry?" */
function afterLabel(title: string): string {
  return title
    .replace(
      /^(Class Starter|Daily Pages|Exit ticket|Writing practice)\s*:\s*/i,
      ''
    )
    .trim();
}

const STEP_TITLE: Record<string, string> = {
  'class-starter': 'Class starter',
  'daily-pages': 'Daily Pages reflection',
  'exit-ticket': 'Exit ticket',
};

/** A stack piece as the plan sees it: a step of the lesson, a material, or both. */
type Expanded = {
  step?: LessonPlanStep;
  material?: string;
  source?: string;
  /** The stack piece's kind, to know a closing when it sees one. */
  kind?: string;
};

const CLOSING_TITLE = /^\s*(?:closing|close|exit ticket|wrap[- ]?up|closure)\b/i;

function expand(entry: LessonPlanEntry): Expanded[] {
  const { title, minutes } = splitTitle(entry.title);
  switch (entry.kind) {
    case 'slides': {
      const outcome = readSlideDeck(entry.content);
      const count = outcome.kind === 'deck' ? outcome.deck.slides.length : null;
      return [
        {
          material: `Slide deck: ${title}${count ? ` (${count} ${count === 1 ? 'slide' : 'slides'})` : ''}`,
        },
      ];
    }
    case 'lesson': {
      const steps = readPlanSteps(entry.content);
      if (!steps.length) {
        return [
          {
            step: {
              title,
              minutes,
              summary: firstSentences(entry.content),
              purpose: '',
            },
            source: plain(entry.content),
          },
        ];
      }
      return steps.map((step) => ({
        step: {
          title: step.title,
          minutes: step.minutes,
          summary: firstSentences(step.content),
          purpose: '',
        },
        source: plain(step.content),
      }));
    }
    case 'class-starter':
    case 'daily-pages':
    case 'exit-ticket': {
      const named = afterLabel(title);
      const material =
        entry.kind === 'exit-ticket'
          ? 'Exit ticket (Yawp! assignment)'
          : `${STEP_TITLE[entry.kind]} (Yawp! assignment)${named ? `: ${named}` : ''}`;
      return [
        {
          step: {
            title: STEP_TITLE[entry.kind]!,
            minutes,
            summary: firstSentences(entry.content),
            purpose: DEFAULT_PURPOSE[entry.kind]!,
          },
          material,
        },
      ];
    }
    case 'handout':
    case 'sample':
    case 'practice':
      return [
        {
          step: {
            title,
            minutes,
            summary: firstSentences(entry.content),
            purpose: DEFAULT_PURPOSE[entry.kind] ?? '',
          },
          material:
            entry.kind === 'practice'
              ? `${title} (Yawp! assignment)`
              : `${title} (${entry.kind === 'sample' ? 'sample' : 'handout'})`,
        },
      ];
    case 'answer-key':
    case 'rubric':
      return [
        {
          material: `${title} (${entry.kind === 'rubric' ? 'rubric' : 'answer key'})`,
        },
      ];
    default:
      // A lesson step, a framing, notes: a moment of the lesson.
      return [
        {
          step: {
            title,
            minutes,
            summary: firstSentences(entry.content),
            purpose: DEFAULT_PURPOSE[entry.kind] ?? '',
          },
        },
      ];
  }
}

/** Each piece expanded, with the text a summary is written from. */
function expandAll(entries: LessonPlanEntry[]): Expanded[] {
  return entries.flatMap((entry) =>
    expand(entry).map((item) => ({
      ...(item.step && !item.source ? { ...item, source: plain(entry.content) } : item),
      ...(item.step ? { step: { ...item.step, kind: entry.kind, ...(entry.piece ? { piece: entry.piece } : {}) } } : {}),
      kind: entry.kind,
    }))
  );
}

/** The parts the model is asked to summarize, in order, with their text. */
export function planStepsForSummary(
  entries: LessonPlanEntry[]
): Array<LessonPlanStep & { content: string }> {
  return expandAll(entries).flatMap((item) =>
    item.step
      ? [{ ...item.step, content: item.source ?? item.step.summary }]
      : []
  );
}

export function buildLessonPlanDoc({
  title,
  className,
  periodMinutes,
  entries,
  summaries,
}: {
  title: string;
  className: string | null;
  periodMinutes: number | null;
  entries: LessonPlanEntry[];
  summaries?: LessonPlanSummaries | null;
}): LessonPlanDoc {
  const expanded = expandAll(entries);
  const materials = expanded.flatMap((item) =>
    item.material ? [item.material] : []
  );
  const stepItems = expanded.filter((item) => item.step);
  const base = stepItems.map((item) => item.step!);
  // The model's words only when they are for this exact list of steps.
  const fits = summaries?.steps && summaries.steps.length === base.length;
  const instructions = base.map((step, index) => {
    const written = fits ? summaries!.steps![index] : null;
    const shortTitle = written?.title?.trim();
    return {
      ...step,
      summary: hidePromptIds(written?.summary?.trim() || step.summary),
      purpose: hidePromptIds(written?.purpose?.trim() || step.purpose),
      ...(shortTitle ? { shortTitle: hidePromptIds(shortTitle) } : {}),
      ...(written?.optional ? { optional: true } : {}),
    };
  });

  // The stack decides the sections: its last closing or exit ticket is the
  // Closing, never a second version beside it (Brian's run 3, item 12).
  let closingIndex = -1;
  stepItems.forEach((item, index) => {
    if (item.kind === 'exit-ticket' || CLOSING_TITLE.test(item.step!.title)) closingIndex = index;
  });
  const closingStep = closingIndex >= 0 ? instructions[closingIndex]! : null;
  const steps = instructions.filter((_, index) => index !== closingIndex);

  const length = periodMinutes
    ? `A ${periodMinutes}-minute lesson`
    : 'A lesson';
  const forClass = className ? ` for ${className}` : '';
  const hasExitTicket = entries.some((entry) => entry.kind === 'exit-ticket');

  return {
    title,
    className,
    periodMinutes,
    overview:
      summaries?.overview?.trim() ||
      `${length}${forClass}: ${title}. ${instructions.length} ${instructions.length === 1 ? 'part' : 'parts'}, in the order below.`,
    goals: summaries?.goals?.length
      ? summaries.goals
      : ['Add this lesson’s goals and any standards it meets.'],
    teacherWill: summaries?.teacherWill?.length ? summaries.teacherWill : [],
    materials,
    instructions: steps,
    closing: closingStep
      ? closingStep.summary
      : `Suggested closing: not in your stack. ${
          summaries?.closing?.trim() ||
          (hasExitTicket
            ? 'Close with the exit ticket, and read the answers before the next class.'
            : 'Close by asking students what they will carry into the next class.')
        }`,
    closingStep,
    closingInStack: Boolean(closingStep),
    assessment: assessmentFrom(entries),
  };
}

/** What the lesson checks, from the writing the stack collects. */
function assessmentFrom(entries: LessonPlanEntry[]): string | null {
  const ticket = entries.find((entry) => entry.kind === 'exit-ticket');
  if (ticket) return `The exit ticket: ${firstSentences(ticket.content)}`;
  const daily = entries.find((entry) => entry.kind === 'daily-pages');
  if (daily) return `Daily Pages: ${firstSentences(daily.content)}`;
  return null;
}

/** Changes whenever the stack does, so a cached summary is never stale. */
export function planSummaryKey(entries: LessonPlanEntry[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        entries.map((entry) => [entry.kind, entry.title, entry.content])
      )
    )
    .digest('hex')
    .slice(0, 32);
}

/**
 * The stack, as the plan reads it: each filed piece by its own kind (a class
 * starter, not "handout"), a whole kept reply as a lesson followed by the
 * materials inside it, and a deck as a deck.
 */
export function entriesFromPacket(
  packet: LessonPacket,
  materialKinds: Record<string, string>
): LessonPlanEntry[] {
  // A deck is built from the stack without the deck in it, so its slides
  // number the other pieces.
  let piece = 0;
  return packet.sections.flatMap((section): LessonPlanEntry[] => {
    const isDeck = section.origin === 'material' && (materialKinds[section.id] ?? section.kind) === 'slides';
    if (!isDeck) piece += 1;
    if (section.origin === 'material') {
      return [
        {
          ...(isDeck ? {} : { piece }),
          kind:
            materialKinds[section.id] ??
            (section.kind === 'slides'
              ? 'slides'
              : section.kind === 'handout'
                ? 'handout'
                : 'notes'),
          title: section.title,
          content: section.deck
            ? fenceSlideDeck(section.deck)
            : section.content,
        },
      ];
    }
    return [
      { kind: 'lesson', title: section.title, content: section.content, piece },
      ...(section.deck
        ? [
            {
              kind: 'slides',
              title: section.deck.title,
              content: fenceSlideDeck(section.deck),
            },
          ]
        : []),
      ...section.materials.map((material) => ({
        kind: material.kind,
        title: material.title,
        content: material.content,
      })),
    ];
  });
}

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
import { multiDayTitle, readPlanDays } from './plan-days';
import { hidePromptIds } from './prompt-ids';
import { readUnitPlan } from './unit-plan';

/** One piece of the stack, in stack order. */
export type LessonPlanEntry = {
  /** A material kind (`step`, `notes`, `class-starter`, …) or `lesson` for a kept reply. */
  kind: string;
  title: string;
  content: string;
  /** Its number in the stack, the one a deck's slides carry as `step`. */
  piece?: number;
  /** The stack step it is (its section id), for its teacher notes. */
  id?: string;
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
  /** The stack step it comes from (Oct 24 handoff, task 7). */
  stepId?: string;
  /** The teacher's notes for it, printed under it, as "Open with: …" lines. */
  teacherNotes?: string;
  /** A unit's day: what happens in it, one line each (Nov 22: units printed empty). */
  parts?: string[];
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
  /**
   * Set aside for a class that finishes early (Kevin's notes 8c, 10c),
   * printed after the Closing as "If you have more time". Empty: no section.
   */
  extensions: LessonPlanStep[];
  /** Prefilled from the exit ticket or Daily Pages in the stack, when any. */
  assessment: string | null;
  /** The standards the teacher named in the planner, never inferred. */
  standards: string[];
  /**
   * A unit plan, printed as its unit map: each instruction is a day (Nov 22
   * review: a 15-day unit printed as an empty lesson with "0 parts").
   */
  unit?: { subtitle: string | null; endsWith: string | null; days: number };
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

/**
 * Where one sentence ends and the next begins: after its stop, and after the
 * quotation mark or bracket that closes on it ("…a promise?" Cold-call…).
 * Matching sentences instead dropped a first sentence that ended inside a
 * quotation and started the summary on its closing mark (Nov 22 review).
 */
const SENTENCE_BREAK = /(?<=[.!?]["'”’)\]]*)\s+/;

/** The first sentence or so, never the whole text. */
function firstSentences(markdown: string): string {
  const text = plain(markdown);
  if (!text) return '';
  const sentences = text.split(SENTENCE_BREAK).filter(Boolean);
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
      /^(Class Starter|Daily Pages|Short Response|Exit ticket|Writing practice)\s*:\s*/i,
      ''
    )
    .trim();
}

const STEP_TITLE: Record<string, string> = {
  'class-starter': 'Class starter',
  'daily-pages': 'Short Response',
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
      ...(item.step
        ? {
            step: {
              ...item.step,
              kind: entry.kind,
              ...(entry.piece ? { piece: entry.piece } : {}),
              ...(entry.id ? { stepId: entry.id } : {}),
            },
          }
        : {}),
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
  standards = [],
  extensionIds = [],
  objectives = [],
}: {
  title: string;
  className: string | null;
  periodMinutes: number | null;
  entries: LessonPlanEntry[];
  summaries?: LessonPlanSummaries | null;
  /** The standards the teacher named (teacher-standards.ts). */
  standards?: string[];
  /** The stack steps set aside as extensions, in the order set aside. */
  extensionIds?: string[];
  /** The objective the planner's reply states (replyObjectives): the goals. */
  objectives?: string[];
}): LessonPlanDoc {
  const expanded = expandAll(entries);
  const materials = expanded.flatMap((item) =>
    item.material ? [item.material] : []
  );
  const stepItems = expanded.filter((item) => item.step);
  const base = stepItems.map((item) => item.step!);
  // The model's words only when they are for this exact list of steps.
  const fits = summaries?.steps && summaries.steps.length === base.length;
  const allInstructions = base.map((step, index) => {
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

  // Summaries are written for every step; the extensions are then taken out.
  const aside = new Set(extensionIds);
  const isAside = (step: LessonPlanStep) => Boolean(step.stepId && aside.has(step.stepId));
  const extensions = extensionIds.flatMap((id) => allInstructions.filter((step) => step.stepId === id));
  const kept = stepItems.flatMap((item, index) => (isAside(allInstructions[index]!) ? [] : [{ item, index }]));
  const instructions = kept.map(({ index }) => allInstructions[index]!);

  // The stack decides the sections: its last closing or exit ticket is the
  // Closing, never a second version beside it (Brian's run 3, item 12).
  let closingIndex = -1;
  kept.forEach(({ item }, index) => {
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
    // The objective the reply stated, as the teacher saw it (Nov 22 review:
    // the plan said "Add this lesson's goals" under a stated objective).
    goals: objectives.length
      ? objectives
      : summaries?.goals?.length
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
    extensions,
    assessment: assessmentFrom(entries),
    standards,
  };
}

/** What the lesson checks, from the writing the stack collects. */
function assessmentFrom(entries: LessonPlanEntry[]): string | null {
  const ticket = entries.find((entry) => entry.kind === 'exit-ticket');
  if (ticket) return `The exit ticket: ${firstSentences(ticket.content)}`;
  const daily = entries.find((entry) => entry.kind === 'daily-pages');
  if (daily) return `Short Response: ${firstSentences(daily.content)}`;
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
          ...(isDeck ? {} : { piece, id: section.id }),
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
      { kind: 'lesson', title: section.title, content: section.content, piece, id: section.id },
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

/**
 * The teacher's notes under each step of the plan (Oct 24 handoff, task 7),
 * once per stack step: a reply read as several steps has them under its first.
 */
export function withTeacherNotes(doc: LessonPlanDoc, notes: Record<string, string>): LessonPlanDoc {
  const seen = new Set<string>();
  const attach = (step: LessonPlanStep): LessonPlanStep => {
    if (!step.stepId || seen.has(step.stepId)) return step;
    seen.add(step.stepId);
    const text = notes[step.stepId]?.trim();
    return text ? { ...step, teacherNotes: text } : step;
  };
  return {
    ...doc,
    instructions: doc.instructions.map(attach),
    closingStep: doc.closingStep ? attach(doc.closingStep) : null,
    extensions: doc.extensions.map(attach),
  };
}

const FENCE = /```[\s\S]*?```/g;
const OBJECTIVE_LEAD =
  /^\s{0,3}(#{1,6}\s+)?(?:[-*+]\s+)?(?:\*\*|__)?\s*(?:learning\s+|lesson\s+)?objectives?\b(.*)$/i;
const LIST_ITEM = /^\s{0,6}(?:[-*+]|\d{1,2}[.)])\s+(.*)$/;

/** A line of Markdown as words: no emphasis marks. */
function plainLine(text: string): string {
  return text
    .replace(/\*\*|__/g, '')
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The objective a planner's reply states ("**Objective:** Students will …",
 * an "Objectives" heading over a list), in its own words; empty when it
 * states none. Text inside fences (a deck, a unit map) is never read.
 */
export function replyObjectives(content: string): string[] {
  const lines = content.replace(FENCE, (fence) => fence.replace(/[^\n]/g, ' ')).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = OBJECTIVE_LEAD.exec(lines[index]!);
    if (!match) continue;
    const heading = Boolean(match[1]);
    const tail = match[2] ?? '';
    const rest = /^\s*(?:\*\*|__)?\s*(:)?\s*(?:\*\*|__)?\s*(.*)$/.exec(tail)!;
    // "Objective: …", a heading, or the word alone over a list; never a
    // sentence that happens to start with the word.
    const alone = !tail.trim() || /^\s*(?:\*\*|__)\s*$/.test(tail);
    if (!rest[1] && !heading && !alone) continue;
    const inline = plainLine(rest[2] ?? '');
    if (inline) return [inline];
    // The objectives under it: a list, or one paragraph.
    const found: string[] = [];
    for (const line of lines.slice(index + 1)) {
      if (!line.trim()) {
        if (found.length) break;
        continue;
      }
      if (/^\s{0,3}#{1,6}\s/.test(line) || /^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) break;
      const item = LIST_ITEM.exec(line);
      const text = plainLine(item ? item[1]! : line);
      if (!text) continue;
      if (item || !found.length) found.push(text);
      else found[found.length - 1] = `${found[found.length - 1]} ${text}`;
    }
    return found;
  }
  return [];
}

/**
 * The goals for a stack: the objective of the reply its pieces came from, in
 * stack order; with none, the newest reply that states one.
 */
export function objectivesForStack({
  replies,
  sourceIds,
}: {
  /** The conversation's assistant replies, oldest first. */
  replies: Array<{ id: string; content: string }>;
  /** The replies the stack's pieces came from, in stack order. */
  sourceIds: string[];
}): string[] {
  const byId = new Map(replies.map((reply) => [reply.id, reply.content]));
  for (const id of new Set(sourceIds)) {
    const content = byId.get(id);
    const found = content ? replyObjectives(content) : [];
    if (found.length) return found;
  }
  for (const reply of [...replies].reverse()) {
    const found = replyObjectives(reply.content);
    if (found.length) return found;
  }
  return [];
}

export type UnitMapDay = {
  day: number;
  title: string;
  minutes: number | null;
  objective: string | null;
  /** What the day hands to the next one. */
  purpose: string | null;
  /** What happens in the day, one line each. */
  parts: string[];
};

export type UnitMap = {
  title: string;
  subtitle: string | null;
  endsWith: string | null;
  days: UnitMapDay[];
};

/**
 * A reply that plans several days (a `yawp-unit` map, or "## Day 1 …"
 * headings, read as plan-days reads them), as the days to print; null for a
 * single lesson.
 */
export function unitMapFromReply(content: string): UnitMap | null {
  const outcome = readUnitPlan(content);
  if (outcome.kind === 'unit' && outcome.unit.days.length >= 2) {
    const { unit } = outcome;
    return {
      title: unit.title,
      subtitle: unit.subtitle ?? null,
      endsWith: unit.endsWith ?? null,
      days: [...unit.days]
        .sort((a, b) => a.day - b.day)
        .map((day) => ({
          day: day.day,
          title: day.title,
          minutes: day.minutes ?? null,
          objective: day.objective,
          purpose: day.buildsTo ?? null,
          parts: [
            day.reading ? `Reading: ${day.reading}` : null,
            `In class: ${day.students}`,
            day.check ? `Check: ${day.check}` : null,
          ].filter((part): part is string => Boolean(part)),
        })),
    };
  }
  const days = readPlanDays(content);
  if (days.length < 2) return null;
  return {
    title: multiDayTitle(content, days),
    subtitle: null,
    endsWith: null,
    days: days.map((day) => ({
      day: day.day,
      title: day.title,
      minutes: day.minutes,
      objective: replyObjectives(day.content)[0] ?? null,
      purpose: null,
      parts: readPlanSteps(day.content).map((step) =>
        step.minutes !== null ? `${step.title} (${step.minutes} min)` : step.title
      ),
    })),
  };
}

/** A unit's plan: its map, a numbered day for each day (Nov 22 review). */
export function buildUnitPlanDoc({
  map,
  className,
  periodMinutes,
  objectives = [],
  standards = [],
}: {
  map: UnitMap;
  className: string | null;
  periodMinutes: number | null;
  /** The unit's own objective, when the reply states one outside its days. */
  objectives?: string[];
  standards?: string[];
}): LessonPlanDoc {
  const count = map.days.length;
  const forClass = className ? ` for ${className}` : '';
  const ends = map.endsWith ? ` It ends with ${map.endsWith.replace(/[.!?]?$/, (stop) => stop || '.')}` : '';
  return {
    title: map.title,
    className,
    periodMinutes,
    overview: `A ${count}-day unit${forClass}: ${map.title}.${ends}`,
    goals: objectives,
    teacherWill: [],
    materials: [],
    instructions: map.days.map((day) => ({
      title: `Day ${day.day}: ${day.title}`,
      // The kit's plan numbers each day already.
      shortTitle: day.title,
      minutes: day.minutes,
      summary: hidePromptIds(day.objective ?? ''),
      purpose: hidePromptIds(day.purpose ?? ''),
      parts: day.parts.map(hidePromptIds),
    })),
    closing: '',
    closingStep: null,
    closingInStack: false,
    extensions: [],
    assessment: map.endsWith ? `Ends with: ${map.endsWith}` : null,
    standards,
    unit: { subtitle: map.subtitle, endsWith: map.endsWith, days: count },
  };
}

/** The newest reply that plans several days, as its map; null when none does. */
export function newestUnitMap(replies: Array<{ content: string }>): UnitMap | null {
  for (const reply of [...replies].reverse()) {
    const map = unitMapFromReply(reply.content);
    if (map) return map;
  }
  return null;
}

/** The replies a stack's pieces came from, in stack order: kept replies and filed pieces' sources. */
export function stackSourceIds(
  packet: Pick<LessonPacket, 'sections'>,
  materialTokens: Record<string, string>
): string[] {
  return packet.sections.flatMap((section) => {
    if (section.origin !== 'material') return [section.id];
    const token = materialTokens[section.id];
    const at = token ? token.indexOf(':') : -1;
    return token ? [at > 0 ? token.slice(0, at) : token] : [];
  });
}

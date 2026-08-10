/**
 * A unit as a map, not a wall of text.
 *
 * A unit plan is the one thing the planner produces that a teacher does not
 * read once and act on. They come back to it on Tuesday to see what Tuesday is,
 * they move a day when a fire drill eats a period, and they build the days out
 * one at a time over a fortnight. Prose cannot do any of that: it can only be
 * read top to bottom.
 *
 * So the map is structured. The planner emits it as a fenced `yawp-unit` block
 * of JSON, and Yawp renders a real day-by-day board where each day carries its
 * own "build this day" button. That button is the whole point — the map is
 * worth having because it is the way into the lessons, not because it is a
 * nice summary of them.
 *
 * Validation is strict for the same reason it is strict on decks: a half-parsed
 * map that renders as a broken board is worse than prose, and the caller falls
 * back to prose when this rejects one.
 */
import { z } from 'zod';

export const UNIT_PLAN_FENCE = 'yawp-unit';

/** A unit nobody could teach: past a point this is a syllabus, not a unit. */
const MAX_DAYS = 30;
const MAX_TITLE_CHARS = 120;
/**
 * One line each. The day's full lesson is what the "build this day" button is
 * for — a map whose cells are paragraphs is the wall of text again, just in a
 * table.
 */
const MAX_CELL_CHARS = 220;

const cell = z.string().trim().min(1).max(MAX_CELL_CHARS);

const daySchema = z
  .object({
    /**
     * Which period this is, as the teacher counts them. Not an array index:
     * a map that has been re-flowed around a lost Tuesday still needs to say
     * which day is which.
     */
    day: z.number().int().min(1).max(MAX_DAYS),
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
    /** What students will be able to do by the end of this period. */
    objective: cell,
    /** What they actually do — the activity, not the pedagogy. */
    students: cell,
    /** What this day hands to the next one. The arc, made checkable. */
    buildsTo: cell.optional(),
    /** How this day finds out whether it worked. */
    check: cell.optional(),
    minutes: z.number().int().min(5).max(240).optional(),
  })
  .strip();

const unitPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
    subtitle: z.string().trim().min(1).max(MAX_TITLE_CHARS).optional(),
    /**
     * What students hand in at the end. A unit without one is a sequence of
     * lessons that happen to be adjacent.
     */
    endsWith: cell.optional(),
    days: z.array(daySchema).min(1).max(MAX_DAYS),
  })
  .strip();

export type UnitPlanDay = z.infer<typeof daySchema>;
export type UnitPlan = z.infer<typeof unitPlanSchema>;

const ANY_FENCE = /```+[^\n]*\n([\s\S]*?)```+/g;

/**
 * The model reaches for these instead of the canonical names often enough to
 * be worth accepting. Renaming a key is cheaper than losing the whole map.
 */
const DAY_ALIASES: Record<string, keyof UnitPlanDay> = {
  number: 'day',
  dayNumber: 'day',
  goal: 'objective',
  learningObjective: 'objective',
  activity: 'students',
  studentWork: 'students',
  studentsDo: 'students',
  leadsTo: 'buildsTo',
  handsTo: 'buildsTo',
  assessment: 'check',
  checkForUnderstanding: 'check',
};

const UNIT_ALIASES: Record<string, string> = {
  name: 'title',
  finalAssignment: 'endsWith',
  summative: 'endsWith',
  endsIn: 'endsWith',
};

function rename(
  raw: Record<string, unknown>,
  aliases: Record<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const [from, to] of Object.entries(aliases)) {
    if (out[from] !== undefined && out[to] === undefined) {
      out[to] = out[from];
      delete out[from];
    }
  }
  return out;
}

/**
 * Fill in day numbers the model left off, in the order it wrote them.
 *
 * It writes the days in sequence and then forgets to number them more often
 * than it gets the numbering wrong, and a map whose days are unnumbered is
 * still a perfectly good map.
 */
function numberDays(days: Array<Record<string, unknown>>): void {
  days.forEach((day, index) => {
    if (typeof day.day !== 'number') day.day = index + 1;
  });
}

export type ValidatedUnitPlan =
  | { ok: true; unit: UnitPlan }
  | { ok: false; reason: string };

export function validateUnitPlan(json: string): ValidatedUnitPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      reason: `not valid JSON: ${(error as Error).message}`,
    };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not an object' };
  }

  const shaped = rename(raw as Record<string, unknown>, UNIT_ALIASES);
  if (Array.isArray(shaped.days)) {
    shaped.days = shaped.days.map((day) =>
      day && typeof day === 'object' && !Array.isArray(day)
        ? rename(day as Record<string, unknown>, DAY_ALIASES)
        : day
    );
    numberDays(shaped.days as Array<Record<string, unknown>>);
  }

  const parsed = unitPlanSchema.safeParse(shaped);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: first
        ? `${first.path.join('.') || 'unit'}: ${first.message}`
        : 'did not match the unit schema',
    };
  }

  // Days in the order a teacher will teach them, whatever order they arrived.
  const days = [...parsed.data.days].sort((a, b) => a.day - b.day);
  return { ok: true, unit: { ...parsed.data, days } };
}

function findUnitBlock(
  content: string
): { block: string; json: string } | null {
  for (const match of content.matchAll(ANY_FENCE)) {
    const inner = match[1];
    if (!inner?.includes('"days"')) continue;
    try {
      const raw = JSON.parse(inner);
      if (raw && typeof raw === 'object' && Array.isArray((raw as any).days)) {
        return { block: match[0], json: inner };
      }
    } catch {
      // A unit-shaped block we cannot parse is still an attempt at one, so the
      // caller can strip it rather than print a wall of braces.
      if (/"days"\s*:\s*\[/.test(inner)) {
        return { block: match[0], json: inner };
      }
    }
  }
  return null;
}

function withoutBlock(content: string, block: string): string {
  return content
    .replace(block, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * What a reply turned out to contain.
 *
 * `unreadable` matters as much as `unit`: a map the schema rejected still has
 * to have its JSON stripped, because the alternative is raw braces in front of
 * a teacher.
 */
export type UnitPlanOutcome =
  | { kind: 'none' }
  | {
      kind: 'unit';
      unit: UnitPlan;
      body: string;
      /** The whole fenced block, so a caller can print something else in its place. */
      block: string;
    }
  | {
      kind: 'unreadable';
      body: string;
      /** The whole fenced block, so a caller can swap a fixed one in place. */
      block: string;
      json: string;
      reason: string;
    };

export function readUnitPlan(content: string): UnitPlanOutcome {
  const found = findUnitBlock(content);
  if (!found) return { kind: 'none' };

  const body = withoutBlock(content, found.block);
  const validated = validateUnitPlan(found.json);
  if (!validated.ok) {
    return {
      kind: 'unreadable',
      body,
      block: found.block,
      json: found.json,
      reason: validated.reason,
    };
  }
  return { kind: 'unit', unit: validated.unit, body, block: found.block };
}

export function hasUnitPlan(content: string): boolean {
  return readUnitPlan(content).kind === 'unit';
}

/**
 * What the model should see when its own map did not render.
 *
 * Replayed history is the only account it has of what it produced. Left as raw
 * JSON, a rejected map reads back to it as a map that shipped.
 */
export const FAILED_UNIT_NOTE =
  '[The unit map you wrote here failed validation. Yawp never rendered it and the teacher never saw it. If they ask about the unit, believe them, apologise briefly, and write the map again from scratch — fewer days, one short line per field. Do not refer back to this one as if it exists.]';

export function markFailedUnitPlans(content: string): string {
  const outcome = readUnitPlan(content);
  if (outcome.kind !== 'unreadable') return content;
  return content.replace(outcome.block, () => FAILED_UNIT_NOTE);
}

/**
 * The message the "build this day" button sends as the teacher.
 *
 * Written as something they could have typed, because that is what it becomes
 * in the transcript — and it carries the day's own words so the planner is
 * building the day the teacher pointed at rather than its own recollection.
 */
export function buildDayRequest(unit: UnitPlan, day: UnitPlanDay): string {
  const parts = [
    `Build day ${day.day} of "${unit.title}" in full: ${day.title}.`,
    `The objective is: ${day.objective}`,
  ];
  if (day.students) parts.push(`Students: ${day.students}`);
  if (day.minutes) parts.push(`I have ${day.minutes} minutes.`);
  parts.push(
    `Keep it inside the arc of the unit — this day comes after day ${
      day.day - 1
    } and has to set up what follows.`
  );
  return parts.join(' ');
}

/** The exact opening `buildDayRequest` writes — read back to recognise its own button. */
const BUILD_DAY_REQUEST = /^Build day (\d+) of "/;

/**
 * Which day a "build this day" click asked for, read back out of the message
 * it sent.
 *
 * Safe to match strictly: the button fires the request as-is with nothing in
 * between to edit it, so a real click always produces this exact opening. A
 * teacher who types their own "build day 2" in free text simply does not
 * match, and gets no unit context rather than a guess built on a coincidence.
 */
export function parseRequestedDay(message: string): number | null {
  const match = BUILD_DAY_REQUEST.exec(message.trim());
  if (!match) return null;
  const day = Number(match[1]);
  return Number.isFinite(day) ? day : null;
}

/**
 * What the planner needs to build one day honestly: not just that day's own
 * row, but where it sits in the arc — otherwise "build day 3" is planned in a
 * vacuum and the map's promise that each day builds on the last quietly stops
 * being true the moment a day is actually built.
 */
export type UnitContext = {
  unitTitle: string;
  endsWith: string | null;
  totalDays: number;
  day: UnitPlanDay;
  previous: UnitPlanDay | null;
  next: UnitPlanDay | null;
};

/** `null` when the requested day is not in this unit — the caller falls back to building without unit context rather than guessing. */
export function buildUnitContext(
  unit: UnitPlan,
  requestedDay: number
): UnitContext | null {
  const index = unit.days.findIndex((day) => day.day === requestedDay);
  if (index === -1) return null;
  return {
    unitTitle: unit.title,
    endsWith: unit.endsWith ?? null,
    totalDays: unit.days.length,
    day: unit.days[index]!,
    previous: index > 0 ? unit.days[index - 1]! : null,
    next: index < unit.days.length - 1 ? unit.days[index + 1]! : null,
  };
}

/**
 * The map as Markdown, for the printed packet.
 *
 * The board is a screen affordance; on paper a teacher wants the same thing as
 * a table they can read at a glance and write on.
 */
export function inlineUnitPlan(content: string): string {
  const outcome = readUnitPlan(content);
  if (outcome.kind !== 'unit') return content;

  const { unit } = outcome;
  const lines: string[] = [`## ${unit.title}`];
  if (unit.subtitle) lines.push('', `*${unit.subtitle}*`);
  if (unit.endsWith) lines.push('', `**Ends with:** ${unit.endsWith}`);
  lines.push('', '| Day | Lesson | Objective | Students do | Check |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const day of unit.days) {
    lines.push(
      `| ${day.day}${day.minutes ? ` (${day.minutes} min)` : ''} | ${day.title} | ${day.objective} | ${day.students} | ${day.check ?? '—'} |`
    );
  }
  return content.replace(outcome.block, () => lines.join('\n'));
}

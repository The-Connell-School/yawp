/**
 * Writing practice the planner assigns, not a worksheet it describes.
 *
 * Quick Writing Lessons are Yawp's sentence-level fundamentals — comma
 * splices, agreement, passive voice, transitions — and each one carries
 * practice exercises. With Writing Practice on, a teacher can assign those
 * exercises to a class and students work them inside Yawp. A lesson that
 * teaches comma splices and then ends on "have them fix a few" leaves the
 * teacher to go and build that assignment somewhere else; this block hands it
 * over instead, and the app puts a button under it that opens the assignment
 * sheet already filled in.
 *
 * It names lessons by slug, never by link: which lessons exist, and whether
 * this school can assign them at all, is the app's to check.
 */

export const PRACTICE_FENCE = 'yawp-practice';

/** The assignment sheet's own bounds and default. */
export const MIN_PRACTICE_PROBLEMS = 1;
export const MAX_PRACTICE_PROBLEMS = 20;
export const DEFAULT_PRACTICE_PROBLEMS = 5;

/** More than this is not a practice set, it is a unit. */
const MAX_LESSONS = 4;
const MAX_TITLE_CHARS = 120;
const MAX_INSTRUCTIONS_CHARS = 600;

export type PlannedPractice = {
  /** Quick Writing Lesson slugs, in the order the planner wrote them. */
  lessonSlugs: string[];
  problemCount: number;
  title: string | null;
  /** Directions for students, when the planner wrote any. */
  instructions: string | null;
};

const PRACTICE_BLOCK = new RegExp(
  '```+' + PRACTICE_FENCE + '[^\\n]*\\n([\\s\\S]*?)```+',
  'g'
);

const HEADER_LINE = /^\s*(lessons?|problems?|title)\s*:\s*(.*?)\s*$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readSlugs(raw: string): string[] {
  const slugs = raw
    .split(/[,;]/)
    .map((slug) => slug.trim().toLowerCase())
    .filter((slug) => SLUG.test(slug));
  return [...new Set(slugs)].slice(0, MAX_LESSONS);
}

function readProblemCount(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PRACTICE_PROBLEMS;
  return Math.min(
    MAX_PRACTICE_PROBLEMS,
    Math.max(MIN_PRACTICE_PROBLEMS, parsed)
  );
}

function parseBlock(inner: string): PlannedPractice | null {
  const lines = inner.split('\n');
  const header: Record<string, string> = {};
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim()) continue;
    const field = HEADER_LINE.exec(line);
    if (!field) break;
    const key = field[1]!.toLowerCase().replace(/s$/, '');
    header[key] = field[2]!;
  }
  // An optional rule between the header and the directions.
  if (lines[index]?.trim() === '---') index += 1;

  const lessonSlugs = readSlugs(header.lesson ?? '');
  if (lessonSlugs.length === 0) return null;

  const title = header.title?.trim().slice(0, MAX_TITLE_CHARS) || null;
  const instructions =
    lines
      .slice(index)
      .join('\n')
      .trim()
      .slice(0, MAX_INSTRUCTIONS_CHARS) || null;

  return {
    lessonSlugs,
    problemCount: readProblemCount(header.problem),
    title,
    instructions,
  };
}

/**
 * The practice sets in a reply, and the reply without their blocks.
 *
 * A block that names no lesson has nothing to assign, so it is dropped rather
 * than drawn as an empty card — but its fence still comes out of the prose.
 */
export function readPlannedPractice(content: string): {
  practices: PlannedPractice[];
  body: string;
} {
  const practices: PlannedPractice[] = [];
  let body = content;

  for (const match of content.matchAll(PRACTICE_BLOCK)) {
    body = body.replace(match[0], '');
    const practice = parseBlock(match[1] ?? '');
    if (practice) practices.push(practice);
  }

  if (body === content) return { practices, body: content };
  return { practices, body: body.replace(/\n{3,}/g, '\n\n').trim() };
}

/** "passive-voice" → "Passive voice", for when the catalog is not to hand. */
function readableSlug(slug: string): string {
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The same reply with each practice set as a line of the plan.
 *
 * On paper there is no button, but the practice is still part of the lesson:
 * the teacher reading the packet should see what was assigned and how much.
 */
export function inlinePlannedPractice(
  content: string,
  lessonTitles: Record<string, string> = {}
): string {
  return content.replace(PRACTICE_BLOCK, (_block, inner: string) => {
    const practice = parseBlock(inner ?? '');
    if (!practice) return '';
    const lessons = practice.lessonSlugs
      .map((slug) => lessonTitles[slug] ?? readableSlug(slug))
      .join(', ');
    const count = `${practice.problemCount} ${
      practice.problemCount === 1 ? 'problem' : 'problems'
    }`;
    const line = `**Writing practice${
      practice.title ? `: ${practice.title}` : ''
    }** — ${count} from ${lessons}.`;
    return practice.instructions
      ? `${line}\n\n> ${practice.instructions.split('\n').join('\n> ')}`
      : line;
  });
}

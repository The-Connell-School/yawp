/**
 * A warm-up the planner wrote, offered as a real Daily Pages exercise.
 *
 * When the library has nothing for a topic the planner writes its own prompt,
 * and until now it announced that fact — "no Daily Pages prompt matched, so
 * this one is mine" — and left the teacher to retype it somewhere. The
 * disclaimer is not what a teacher needs; a way to assign the thing is.
 *
 * So a written prompt comes back in a block the app recognises, and the app
 * puts a button under it that opens the Daily Pages assignment sheet with the
 * prompt already in it. Provenance stops being a sentence to read and becomes
 * a button to press.
 */

export const DAILY_PAGES_FENCE = 'yawp-daily-pages';

/** Long enough to be a prompt, short enough to fit an assignment field. */
const MAX_PROMPT_CHARS = 600;

/**
 * Which of Yawp's two short-writing exercises a prompt is offered as.
 *
 * They are different lesson moves, not two names for one. A Class Starter is
 * the three or four minutes that get pens moving at the bell, graded on
 * engagement alone. Daily Pages is a reflection anchored in a text or topic,
 * graded on depth as well as effort, and it costs ten to fifteen minutes of
 * the period — which is why it belongs wherever the thinking belongs, not
 * automatically at the door.
 *
 * They are also graded by different rubrics, so the one a block names decides
 * which assignment sheet its button opens.
 */
export const WRITING_EXERCISE_KINDS = ['class-starter', 'daily-pages'] as const;

export type WritingExerciseKind = (typeof WRITING_EXERCISE_KINDS)[number];

/** What the card calls each of them, in the teacher's words. */
export const WRITING_EXERCISE_LABELS: Record<WritingExerciseKind, string> = {
  'class-starter': 'Class Starter',
  'daily-pages': 'Daily Pages',
};

export type DailyPagesExercise = {
  /**
   * Which exercise this is. Absent from every block written before the two
   * were told apart, and those all meant Daily Pages.
   */
  kind: WritingExerciseKind;
  /** The prompt exactly as students should see it. */
  prompt: string;
  /**
   * The library prompt's id, when this came from Daily Pages rather than being
   * written for the lesson. Shown as provenance a teacher can check, not as a
   * disclaimer about where it did not come from.
   */
  promptId: string | null;
};

const DAILY_PAGES_BLOCK = new RegExp(
  '```+' + DAILY_PAGES_FENCE + '[^\\n]*\\n([\\s\\S]*?)```+',
  'g'
);

/**
 * Strip the quoting a model reaches for when it writes a prompt: a leading
 * Markdown blockquote marker, or wrapping straight/curly quotes.
 */
function unquote(raw: string): string {
  const withoutMarkers = raw
    .split('\n')
    .map((line) => line.replace(/^\s{0,3}>\s?/, ''))
    .join('\n')
    .trim();
  const quoted = /^["“](.*)["”]$/s.exec(withoutMarkers);
  return (quoted?.[1] ?? withoutMarkers).trim();
}

/** An optional `id: FW-001` header line, naming a real library prompt. */
const ID_LINE = /^\s*id:\s*([A-Za-z0-9][\w-]{0,31})\s*$/;

/** An optional `kind: class-starter` header line. */
const KIND_LINE = /^\s*kind:\s*([A-Za-z][A-Za-z -]{0,31})\s*$/;

/**
 * Read the kind however the model spelled it — "Class Starter", "class-starter",
 * "CLASS STARTER" are one answer. A word we do not know is not worth failing a
 * prompt over: it falls back to Daily Pages, which is what every block meant
 * before the line existed.
 */
function readKind(raw: string): WritingExerciseKind {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return (WRITING_EXERCISE_KINDS as readonly string[]).includes(normalized)
    ? (normalized as WritingExerciseKind)
    : 'daily-pages';
}

/**
 * Peel the header lines off the front of a block.
 *
 * `id:` and `kind:` may appear in either order — the model writes whichever
 * comes to mind first — and everything from the first line that is neither is
 * the prompt.
 */
function splitHeader(raw: string): {
  kind: WritingExerciseKind;
  promptId: string | null;
  rest: string;
} {
  const lines = raw.split('\n');
  let kind: WritingExerciseKind = 'daily-pages';
  let promptId: string | null = null;
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor]!;
    const idMatch: RegExpExecArray | null =
      promptId === null ? ID_LINE.exec(line) : null;
    if (idMatch) {
      promptId = idMatch[1]!;
      cursor += 1;
      continue;
    }
    const kindMatch = KIND_LINE.exec(line);
    if (kindMatch) {
      kind = readKind(kindMatch[1]!);
      cursor += 1;
      continue;
    }
    break;
  }

  return { kind, promptId, rest: lines.slice(cursor).join('\n') };
}

/**
 * The Daily Pages warm-ups in a reply, and the reply without their blocks.
 *
 * Every warm-up goes through here, whether the planner found it in the library
 * or wrote it: a teacher should never read "Warm-up — Daily Pages (7 min)" and
 * have to guess what their students will actually be asked.
 */
export function readDailyPagesExercises(content: string): {
  exercises: DailyPagesExercise[];
  body: string;
} {
  const exercises: DailyPagesExercise[] = [];
  let body = content;

  for (const match of content.matchAll(DAILY_PAGES_BLOCK)) {
    body = body.replace(match[0], '');
    const { kind, promptId, rest } = splitHeader(match[1] ?? '');
    const prompt = unquote(rest);
    // An empty block is the model opening one and thinking better of it.
    if (!prompt) continue;
    exercises.push({
      kind,
      prompt: prompt.slice(0, MAX_PROMPT_CHARS),
      promptId,
    });
  }

  if (body === content) return { exercises, body: content };
  return { exercises, body: body.replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * The same reply, with each written warm-up turned back into a blockquote.
 *
 * On the packet page there is no button to offer — the packet is a thing to
 * print — but the prompt is real lesson content and has to appear. Printing the
 * fence instead would put a code block in the middle of a lesson plan.
 */
export function inlineDailyPagesExercises(content: string): string {
  return content.replace(DAILY_PAGES_BLOCK, (_match, raw: string) => {
    const prompt = unquote(splitHeader(raw ?? '').rest);
    if (!prompt) return '';
    return prompt
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  });
}

/** The search param that carries the lesson a teacher came from. */
export const FROM_LESSON_PARAM = 'fromLesson';

/**
 * Where the teacher lands when they accept the offer: the Daily Pages
 * assignment type, with its creation sheet open and the prompt already filled
 * in. `newPrompt` is the search param that page reads.
 *
 * The lesson's own id travels with them. Embedding a creator inside a plan
 * means the button is a door out of the planner, and a teacher who walks
 * through it should not have to find their way back through the sidebar to a
 * lesson they were in the middle of.
 */
export function dailyPagesCreateHref(
  assignmentTypeId: string,
  prompt: string,
  conversationId?: string | null
): string {
  const params = new URLSearchParams({ newPrompt: prompt });
  if (conversationId) params.set(FROM_LESSON_PARAM, conversationId);
  return `/app/assignment-types/${assignmentTypeId}?${params}`;
}

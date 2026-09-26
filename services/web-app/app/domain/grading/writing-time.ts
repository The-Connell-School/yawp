/**
 * How long a student had to write, and what the grading assistant and the
 * grammar checker do with it.
 *
 * Both used to read every submission as if it were a revised essay. A
 * ten-minute paragraph read that way loses marks for polish no one could have
 * given it, and a deliberate fragment gets flagged as an error. The teacher
 * sets the time on the assignment; both passes calibrate to it.
 *
 * Null means no time was given, and every prompt below is then exactly the
 * prompt that ran before this setting existed — which is every assignment
 * written before the column did.
 */

export const WRITING_TIME_FIELD = 'writingTimeMinutes';
export const MIN_WRITING_TIME_MINUTES = 1;
export const MAX_WRITING_TIME_MINUTES = 240;

/**
 * Up to this long, a piece is treated as written in one sitting without time
 * to revise: the checker marks errors only, not style.
 */
const SHORT_TIMED_WRITING_MAX_MINUTES = 30;

export type ParseWritingTimeMinutesResult =
  | { success: true; sent: boolean; value: number | null }
  | { success: false; message: string };

/**
 * Absent and blank are different answers. Absent means the form never sent the
 * field — an older caller — so an update must leave the stored value alone.
 * Blank means the teacher cleared it.
 */
export function parseWritingTimeMinutes(
  formData: FormData
): ParseWritingTimeMinutesResult {
  if (!formData.has(WRITING_TIME_FIELD)) {
    return { success: true, sent: false, value: null };
  }
  const raw = formData.get(WRITING_TIME_FIELD)?.toString().trim() ?? '';
  if (!raw) return { success: true, sent: true, value: null };

  const minutes = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_WRITING_TIME_MINUTES ||
    minutes > MAX_WRITING_TIME_MINUTES
  ) {
    return {
      success: false,
      message: `Writing time must be a whole number of minutes from ${MIN_WRITING_TIME_MINUTES} to ${MAX_WRITING_TIME_MINUTES}.`,
    };
  }
  return { success: true, sent: true, value: minutes };
}

/**
 * The time the creation form suggests for a new assignment of this kind. Only
 * a suggestion: nothing reads it at grading time, so an existing assignment
 * without a writing time is never given one behind the teacher's back.
 */
export function defaultWritingTimeMinutesForKind(
  kind: string | null | undefined
): number | null {
  switch (kind) {
    case 'daily_pages':
      return 15;
    case 'class_starter':
      return 10;
    default:
      return null;
  }
}

export function describeWritingTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (hours === 0) return unit(rest, 'minute');
  if (rest === 0) return unit(hours, 'hour');
  return `${unit(hours, 'hour')} ${unit(rest, 'minute')}`;
}

function hasWritingTime(minutes: number | null | undefined): minutes is number {
  return typeof minutes === 'number' && minutes > 0;
}

export function buildWritingTimeGradingBlock(
  minutes: number | null | undefined
): string {
  if (!hasWritingTime(minutes)) return '';
  const time = describeWritingTime(minutes);
  return [
    `Writing time: the student had ${time} to write this, start to finish. It is not a revised piece.`,
    `Grade it as ${time} of writing: hold it to the thinking, structure and correctness a careful writer can reach in that time, and do not take off for length or for polish only revision could add.`,
    `Calibrating is not going easy. A claim with nothing behind it is still thin, and errors that get in the reader's way still count.`,
  ].join('\n');
}

const GRAMMAR_CHECKER_SYSTEM_PROMPT = `You are the Grammar/Usage Checker.\nReturn ONLY valid JSON with the schema:\n{\n  \"issues\": [{\n    \"excerpt\": string,\n    \"occurrence\"?: number,\n    \"kind\": \"error\"|\"style\",\n    \"ruleNumber\"?: number,\n    \"rule\"?: string,\n    \"message\": string\n  }]\n}\nRules:\n- Highlight the smallest exact excerpt that demonstrates the issue (max 120 characters).\n- If the excerpt appears multiple times, set occurrence to the 1-based match index.\n- Keep message brief (1-2 sentences). State the rule plainly; do not offer to fix it for the student.\n- Focus on essentials: usage, composition, comma/semicolon rules, and omit needless words.\n\nComma rules:\n(1) In a series of three or more terms with a single conjunction, use a comma after each term except the last.\n(2) Enclose parenthetic expressions between commas.\n(3) Do not join independent clauses with a comma (comma splice); use a semicolon, conjunction, or separate sentences.\nSemicolon rule:\nUse a semicolon to join closely related independent clauses.\n\nStyle:\n(10) Omit needless words.`;

export function buildGrammarCheckerSystemPrompt(
  minutes: number | null | undefined
): string {
  if (!hasWritingTime(minutes)) return GRAMMAR_CHECKER_SYSTEM_PROMPT;
  const time = describeWritingTime(minutes);
  const lines = [
    `Writing time: this was written in ${time}, start to finish, without time to revise. Check it as that, not as a finished essay.`,
    `- Mark the errors a careful writer still catches in ${time}: spelling, agreement, tense, usage, comma splices, run-ons, missing or wrong punctuation.`,
    `- Do not mark a sentence fragment used on purpose for emphasis, informal phrasing that is correct, or a sentence that is only plain.`,
  ];
  if (minutes <= SHORT_TIMED_WRITING_MAX_MINUTES) {
    lines.push(
      `- Do not return any issue of kind "style". In ${time} there is no time to cut needless words; mark errors only.`
    );
  }
  return `${GRAMMAR_CHECKER_SYSTEM_PROMPT}\n\n${lines.join('\n')}`;
}

export function buildGrammarCheckerUserPrompt(
  text: string,
  minutes: number | null | undefined
): string {
  if (!hasWritingTime(minutes)) {
    return `Essay:\n${text}\n\nReturn up to 15 issues.`;
  }
  return `Essay (Written in ${describeWritingTime(minutes)}):\n${text}\n\nReturn up to 15 issues.`;
}

/**
 * The schema-repair retry used to demand eight to twelve issues. On a
 * ten-minute paragraph that is an instruction to invent errors, so with a
 * writing time it asks only for the real ones.
 */
export function buildGrammarCheckerRetryUserPrompt(
  text: string,
  minutes: number | null | undefined
): string {
  if (!hasWritingTime(minutes)) {
    return `Essay:\n${text}\n\nReturn 8-12 issues using the exact schema. Do not include markdown.`;
  }
  return `Essay (Written in ${describeWritingTime(minutes)}):\n${text}\n\nReturn only real issues, up to 12, using the exact schema. Do not include markdown.`;
}

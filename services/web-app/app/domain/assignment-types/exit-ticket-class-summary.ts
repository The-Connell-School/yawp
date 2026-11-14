/**
 * The class summary of an exit ticket: what the class understood, where the
 * confusion is, and whether to reteach — read from what students actually
 * wrote, not just their scores.
 *
 * The Class read beside it is deterministic and free (band counts, questions,
 * who to check in with). This is the model-written half, generated when the
 * teacher asks and cached until new responses arrive. It never sees student
 * names, and never names a student back.
 *
 * Client-safe: types, labels, the prompt, validation of the model's JSON, the
 * fixture, and the planner seed lines. The model call and storage live in
 * `exit-ticket-class-summary.server.ts`.
 */
import { exitTicketActivityOption } from './exit-ticket-activities';
import type { ExitTicketConfig } from './exit-ticket';

/** Fewer than this is a few students, not a class to summarize. */
export const EXIT_TICKET_SUMMARY_MIN_RESPONSES = 3;
/** A class or two of tickets; past this the summary reads a sample. */
export const EXIT_TICKET_SUMMARY_MAX_RESPONSES = 60;
/** An exit ticket is a few sentences; longer is cut, not dropped. */
export const EXIT_TICKET_SUMMARY_RESPONSE_MAX_CHARS = 800;
const CONFUSION_CAP = 3;
const MOVE_MIN_MINUTES = 5;
const MOVE_MAX_MINUTES = 15;

export const EXIT_TICKET_RETEACH_LEVELS = [
  'none',
  'quick-review',
  'reteach',
] as const;
export type ExitTicketReteachLevel =
  (typeof EXIT_TICKET_RETEACH_LEVELS)[number];

export const EXIT_TICKET_RETEACH_LABELS: Record<
  ExitTicketReteachLevel,
  string
> = {
  none: 'Move on',
  'quick-review': 'Quick review',
  reteach: 'Reteach',
};

export const EXIT_TICKET_CONFUSION_SHARES = ['a few', 'some', 'most'] as const;
export type ExitTicketConfusionShare =
  (typeof EXIT_TICKET_CONFUSION_SHARES)[number];

export type ExitTicketClassSummary = {
  /** One or two sentences: the idea the class has, named, not the students. */
  understood: string;
  /** Shared misunderstandings or open questions, most common first. */
  confusions: { point: string; share: ExitTicketConfusionShare }[];
  reteach: ExitTicketReteachLevel;
  reteachReason: string;
  /** A short opening block for tomorrow; null when the call is to move on. */
  nextLessonMove: { title: string; minutes: number; detail: string } | null;
};

/** A stored summary as the page shows it. */
export type StoredExitTicketSummary = {
  summary: ExitTicketClassSummary;
  responseCount: number;
  generatedAt: string;
  /** False once responses have arrived or changed since it was written. */
  current: boolean;
};

/** What the assignment page passes the panel while the flag is on. */
export type ExitTicketSummaryPanelData = {
  stored: StoredExitTicketSummary | null;
  /** Enough responses to summarize. */
  canGenerate: boolean;
};

/** The responses the summary reads, in the order they were loaded. */
export function exitTicketSummaryTexts(
  responses: { text: string | null }[]
): string[] {
  return responses
    .map((response) => (response.text ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) =>
      text.length > EXIT_TICKET_SUMMARY_RESPONSE_MAX_CHARS
        ? `${text.slice(0, EXIT_TICKET_SUMMARY_RESPONSE_MAX_CHARS)}…`
        : text
    )
    .slice(0, EXIT_TICKET_SUMMARY_MAX_RESPONSES);
}

/**
 * What the stored summary was read from. Order-insensitive, so the same set
 * of tickets is "current" however it was loaded; any new or edited response
 * changes it. FNV-1a, because this only has to tell sets apart, not resist
 * anyone, and it has to run in the browser bundle too.
 */
export function exitTicketSummaryFingerprint(texts: string[]): string {
  const joined = texts.slice().sort().join('\u0000');
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${texts.length}:${hash.toString(16).padStart(8, '0')}`;
}

/**
 * The fingerprint of every response, not just the ones a capped summary
 * reads: a sixty-first ticket arriving still means the summary is out of date.
 */
export function exitTicketResponsesFingerprint(
  responses: { text: string | null }[]
): string {
  return exitTicketSummaryFingerprint(
    responses
      .map((response) => (response.text ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  );
}

export function buildExitTicketSummaryPrompt({
  assignmentTitle,
  studentPrompt,
  config,
  texts,
  responseCount,
}: {
  assignmentTitle: string | null;
  /** The prompt as students read it. */
  studentPrompt: string;
  config: ExitTicketConfig | null;
  texts: string[];
  /** Every response, including any past the cap. */
  responseCount: number;
}): { system: string; user: string } {
  const system = [
    'You read a class’s exit tickets for their teacher and tell them, the way a colleague would, what the class understood, where the confusion is, and whether to reteach before moving on.',
    '',
    'Read for understanding, not for matching words: a right answer in different words or spelling (a student who writes "Alley" for Allie) is a right answer. Judge against the teacher’s key points when there are any, and against the question otherwise.',
    '',
    'Return JSON only, exactly this shape:',
    '{"understood": string, "confusions": [{"point": string, "share": "a few" | "some" | "most"}], "reteach": "none" | "quick-review" | "reteach", "reteachReason": string, "nextLessonMove": {"title": string, "minutes": number, "detail": string} | null}',
    '',
    '- understood: one or two sentences naming the idea the class has, specific to this lesson. Say how much of the class has it ("most", "about half", "only a few").',
    `- confusions: up to ${CONFUSION_CAP}, most common first. Each is one specific misunderstanding or open question you see in more than one response, in plain words. share: "a few" (two or three students), "some" (a quarter to a half), "most" (more than half). Leave out one-off slips. An empty list is fine.`,
    '- reteach: "none" when most of the class has it; "quick-review" when the idea landed but a shared confusion needs five or ten minutes; "reteach" when most of the class does not have it yet.',
    '- reteachReason: one sentence a teacher can act on.',
    `- nextLessonMove: when reteach is not "none", one concrete opening block for tomorrow aimed at the main confusion: a short title, minutes (${MOVE_MIN_MINUTES}–${MOVE_MAX_MINUTES}), and what the teacher does in one or two sentences. null when reteach is "none".`,
    '',
    'Never name a student, and never quote a response long enough to identify who wrote it. Do not grade grammar or length.',
  ].join('\n');

  const activity = config?.activity
    ? exitTicketActivityOption(config.activity)?.tag
    : null;
  const notes = config?.lessonNotes;
  // A v3 form asks for the correct answer and one note for Yawp!; older
  // forms asked for key points and the main points of the lesson.
  const isV3 = Boolean(config?.activity);
  const user = [
    `Exit ticket: ${assignmentTitle?.trim() || 'Untitled'}`,
    ...(activity ? [`What the students were asked to do: ${activity}`] : []),
    '',
    'What students were asked:',
    studentPrompt.trim(),
    ...(notes?.mustMention
      ? [
          '',
          `${isV3 ? 'Correct answer' : 'Correct answer or key points'}: ${notes.mustMention}`,
        ]
      : []),
    ...(notes?.mainPoints
      ? [
          '',
          `${isV3 ? 'What the teacher wants Yawp! to know' : 'Main points of the lesson'}: ${notes.mainPoints}`,
        ]
      : []),
    ...(notes?.watchFor
      ? ['', `Mix-up the teacher was watching for: ${notes.watchFor}`]
      : []),
    '',
    texts.length < responseCount
      ? `Responses (${texts.length} of ${responseCount}, a sample):`
      : `Responses (${texts.length}):`,
    ...texts.map((text, index) => `${index + 1}. ${text}`),
  ].join('\n');

  return { system, user };
}

function cleanText(value: unknown, max = 600): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

/**
 * The model's JSON, or a stored row, as a summary — or null when it is
 * missing what a teacher needs. Unknown shares and extra confusions are
 * dropped rather than failing the whole summary.
 */
export function readExitTicketClassSummary(
  value: unknown
): ExitTicketClassSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const understood = cleanText(record.understood);
  const reteachReason = cleanText(record.reteachReason);
  const reteach = EXIT_TICKET_RETEACH_LEVELS.includes(
    record.reteach as ExitTicketReteachLevel
  )
    ? (record.reteach as ExitTicketReteachLevel)
    : null;
  if (!understood || !reteach || !reteachReason) return null;

  const confusions = (Array.isArray(record.confusions) ? record.confusions : [])
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as Record<string, unknown>;
      const point = cleanText(item.point, 300);
      const share = EXIT_TICKET_CONFUSION_SHARES.includes(
        item.share as ExitTicketConfusionShare
      )
        ? (item.share as ExitTicketConfusionShare)
        : null;
      return point && share ? [{ point, share }] : [];
    })
    .slice(0, CONFUSION_CAP);

  let nextLessonMove: ExitTicketClassSummary['nextLessonMove'] = null;
  const move = record.nextLessonMove;
  if (reteach !== 'none' && move && typeof move === 'object') {
    const item = move as Record<string, unknown>;
    const title = cleanText(item.title, 120);
    const detail = cleanText(item.detail);
    const minutes = Math.round(Number(item.minutes));
    if (title && detail && Number.isFinite(minutes)) {
      nextLessonMove = {
        title,
        detail,
        minutes: Math.min(
          MOVE_MAX_MINUTES,
          Math.max(MOVE_MIN_MINUTES, minutes)
        ),
      };
    }
  }

  return { understood, confusions, reteach, reteachReason, nextLessonMove };
}

/** What development and e2e get without a model key. */
export function exitTicketSummaryFixture(
  texts: string[]
): ExitTicketClassSummary {
  return {
    understood: `Across ${texts.length} responses, most of the class has the main idea.`,
    confusions: [
      {
        point: 'Some responses name the idea without explaining it.',
        share: 'some',
      },
    ],
    reteach: 'quick-review',
    reteachReason:
      'The idea landed, but several students could not explain it yet.',
    nextLessonMove: {
      title: 'Explain it back',
      minutes: 8,
      detail:
        'Open with two of yesterday’s answers on the board and have pairs say which one explains the idea and why.',
    },
  };
}

/** The summary's half of the "Plan tomorrow from this" opening ask. */
export function exitTicketSummarySeedLines(
  summary: ExitTicketClassSummary
): string[] {
  const lines = ['', `What the class understood: ${summary.understood}`];
  if (summary.confusions.length > 0) {
    lines.push(
      'Where they are confused:',
      ...summary.confusions.map(
        (confusion) => `- ${confusion.point} (${confusion.share})`
      )
    );
  }
  lines.push(
    `Recommendation: ${EXIT_TICKET_RETEACH_LABELS[summary.reteach]}. ${summary.reteachReason}`
  );
  if (summary.nextLessonMove) {
    const move = summary.nextLessonMove;
    lines.push(
      `Suggested opening: ${move.title} (${move.minutes} min). ${move.detail} Build it into tomorrow’s lesson, or tell me why not.`
    );
  }
  return lines;
}

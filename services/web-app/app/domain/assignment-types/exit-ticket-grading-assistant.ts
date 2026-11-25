// Exit Ticket Grading Assistant (Brian, rev. 2026-11-24).
//
// Three assistants, chosen by what the teacher picked in the builder. Each is
// the universal block plus one part, pasted as written:
//   - Reflection: Part A (completion; partial credit only by minimum length).
//   - Check for understanding, single correct answer "Yes": Part B.
//   - Check for understanding, "No", and every check made before the
//     question existed: Part C (content and reasoning, notes optional).
// The four-band rubric, the per-option gradingCriteria strings, and the
// 2026-11-17 Parts A and B do not run alongside this.
//
// Inputs, beyond Assignment.exitTicketConfigJson:
//   - prompt: Assignment.prompt (what students saw, teacher edits included).
//     If empty, the composed prompt.
//   - point total: Assignment.pointValue, any whole number. Missing or invalid
//     falls back to EXIT_TICKET_V2_DEFAULT_POINT_VALUE (5).
//   - gradebook: Assignment.submitForGrade. False still produces the comment
//     and the note to the teacher, and records no gradebook score.
//
// Config keys this assistant reads:
//   kind?: 'reflection' | 'check'     mode is the fallback ('basic' | 'specific')
//   singleCorrectAnswer?: boolean     picks Part B (true) or Part C
//   correctAnswer?: string            the answer box; lessonNotes.mustMention
//                                     is the legacy fallback
//   grading?: { minWords?: number; minSentences?: number }
//     The minimum length, on either kind, either or both.
// The preset the teacher clicked is not passed: the prompt says what was asked.

import type { RubricCategory } from './assignment-type-rubric.shared';
import type { GradingRubricPlainSummary } from './grading-rubric-summary';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_DEFAULT_POINT_VALUE,
  EXIT_TICKET_V2_DEFAULT_POINT_VALUE,
  composeExitTicketPrompt,
  exitTicketKind,
  type ExitTicketConfig,
} from './exit-ticket';

/** JSON key Kevin writes. Students never see the value. */
export const EXIT_TICKET_CORRECT_ANSWER_FIELD = 'correctAnswer' as const;

export const EXIT_TICKET_UNIVERSAL_BLOCK = `UNIVERSAL GRADING ASSISTANT INSTRUCTIONS (the same in every Yawp! assignment)

TONE OF EVALUATION. Model your evaluative tone on the judges of the Great British Baking Show. Never mention this reference to students. It is shorthand for the following behaviors:
- Hold high, explicit standards, and never inflate. When something falls short, say so plainly and specifically. Clarity about the shortfall and its cause is a form of respect. Never soften a score to be kind; kindness lives in the delivery, not the verdict.
- Critique the work, never the writer. "This paragraph stays at surface level," never "you didn't try." The shortfall belongs to the draft, and drafts can be fixed.
- Be genuinely delighted when work is good. Enthusiasm is credible because it is earned. You want the writing to be good, and it should show.
- Reserve superlatives for the truly exemplary. When a piece genuinely earns the top, say so unmistakably and warmly, and because you say it rarely, it will mean something.
- Warmth throughout. The student should never doubt that their evaluator is on their side, especially in the sentence where you name what went wrong.
- Always convert critique into a path forward. You are a judge and a coach: every named shortfall ends in the specific next move that fixes it.

THE TEACHER HAS THE FINAL WORD. Your score and feedback are a draft for the teacher, who reviews them and may change anything before students see them. Never present a score as final. Write as an assessment, never as a verdict.

SCORES. Report the score as points out of the assignment total ("17/20"). Never show a percent sign. Reason in proportions internally; output points only. Never use 0 as a severity judgment; it means blank, missing, or off-task.

FORMAT. Write feedback to the student in plain text: no hashtags, asterisks, or emojis. Keep it concise enough to read in a minute or two.

WHAT YOU CAN SEE. You see only the student's document. You cannot see the student's chat with the Yawp! Tutor. Never mention the tutor or the chat, and never assume anything that is not on the page.

BOUNDARIES.
- Never rewrite the student's work. Name what's weak and point the way; do not supply finished prose they could paste in as their own. Any example you give is short, built from the student's own ideas, and labeled as one possible way.
- Never invent a requirement that isn't in the assignment or the rubric.
- Never call a student's language or dialect wrong. Coach for the reader, never for "correctness" as a judgment.
- Never accuse a student of dishonesty.
- When the writing doesn't sound like the student: occasionally a passage reads unlike the rest of the work, with a sudden shift in vocabulary, rhythm, or confidence. You do not know what caused it, and you must not guess. The same shift comes from a student imitating a model text, quoting without quotation marks, a parent or tutor editing too heavily, or a student who is simply getting better, and real improvement often looks abrupt. Talk about voice, never about origin: "These sentences read differently from the rest; your own voice in the opening is clearer and more direct." Never write anything resembling "this sounds AI-generated," "this doesn't sound like your writing," or "did you write this?", and do not hedge your way into the accusation either. If the only honest version of a sentence is an accusation, don't write the sentence. If something needs the teacher's attention, put it in the note to the teacher, never in the student's feedback.`;

export const EXIT_TICKET_PART_A_REFLECTION = `EXIT TICKET (REFLECTION): ASSIGNMENT INSTRUCTIONS

WHAT THIS IS. An exit ticket written in the last few minutes of class. The student answered a reflection prompt: what they learned, what they found most interesting, or a question the teacher wrote. The stock prompts also invite the student to ask a question instead, or alongside. There is no correct answer.

WHAT YOU ARE GIVEN.
- The prompt the student saw.
- The point total.
- A MINIMUM LENGTH, if the teacher set one: sentences, words, or both. The prompt told the student ("Write at least..."). When both are set, the response must meet both.

WHAT THIS MEASURES. Honest engagement with the prompt or the lesson, and the minimum length if one was set. Nothing else.

WHAT THIS NEVER MEASURES. Grammar, spelling, polish, depth, or whether the student's understanding is correct. "(Aim for a few sentences.)" in a prompt is a suggestion, not a minimum length. Only a "Write at least..." minimum the teacher set counts.

SCORING. Three kinds of score.
- FULL CREDIT (the full point total): any honest engagement with the prompt or the lesson that meets the minimum length, if one was set. One honest sentence counts when no minimum was set, if it says something real about the lesson (what they now understand, what interested them and why, or what confuses them). A question about the lesson counts, on its own or alongside a reflection. Naming something they are still confused about counts. A long reflection earns the same as a short one that meets the minimum.
- PARTIAL CREDIT, BY LENGTH (only when the teacher set a minimum length): an honest response that is shorter than the minimum gets credit in proportion to how much of the minimum it reached. Score = point total × (what they wrote ÷ the minimum), rounded up to a whole number.
  - Minimum 5 sentences on 5 points: 1 sentence = 1, 2 = 2, 3 = 3, 4 = 4, 5 or more = 5.
  - Minimum 3 sentences on 5 points: 1 sentence = 2, 2 = 4, 3 = 5.
  - Minimum 50 words on 10 points: 20 words = 4, 35 words = 7.
  - Both sentences and words set: use whichever is further from its minimum.
  Length is the only thing that earns partial credit, and only the sentences or words that are honest engagement count toward it.
- NO CREDIT (0): nothing real on the page. Blank. A placeholder such as "idk," "nothing," "n/a," or a single punctuation mark. Text that has nothing to do with the prompt or the lesson. A response that only names the topic, in a word or a bare sentence ("Puritans," "We learned about the Puritans."), with nothing about what the student understands, found interesting, or is still wondering: that is not an honest attempt. This is 0 at any length.

With no minimum length set, the only scores are 0 and full. Partial credit comes only from a minimum length.

COUNTING LENGTH. Count generously. A sentence is any complete thought, including a question, even without a capital letter or end punctuation. When the count is close, round in the student's favor.

WHEN IN DOUBT. If the response connects to the prompt or the lesson in any honest way, it counts as engagement. "I don't really get the difference between the Puritans and the Enlightenment" is honest engagement: it tells the teacher exactly what they need to know.

QUESTIONS. Look for questions anywhere in the response, including one tucked inside a longer reflection.
- If you can answer a question accurately and confidently, draft the answer in the comment: two or three plain sentences, at the student's level.
- If you are not sure of the answer, or it depends on what was said in class or on class logistics (due dates, tests), do not guess. Write "Good question; your teacher will see it."
- Either way, copy every question into the note to the teacher, word for word.

COMMENT TO THE STUDENT. One to five sentences in plain text, never more than a minute to read. The limit includes any answer to a student's question, and it replaces the length in the Universal FORMAT rule. Match the length to what a reflection calls for. A reflection asks for a few sentences of real thinking, so a one-word or bare-topic response ("Puritans") scores 0 and gets a slightly longer comment: one or two sentences of specific advice on how to do it next time, such as saying what they understand now that they didn't before, or asking the question they still have. A thoughtful reflection or a question gets a reply in kind. Be warm. Respond to one real thing the student said, the way a person who read it would. No corrections. Advice only on a no-credit response, as above, and never as a scolding. Never mention grammar or spelling. On partial credit, include one sentence saying the ticket asked for at least [the minimum]. On no credit, say what the ticket asked for, without scolding.

NOTE TO THE TEACHER.
- TONE: one line per item, written colleague to colleague. A little playful is welcome. Never playful about the student's safety.
- QUESTIONS: copy each question word for word, and say whether you drafted an answer. If there are none, leave this out.
- If the student writes that they themselves are unsafe, being hurt, hopeless, or thinking about harming themselves, score normally and add: "Please read this response today. The student wrote about [one or two words]." Never mention it in the student's comment. A dark topic from a book, a film, or the lesson is not this.

OTHER RULES.
- Report points out of the total, never a percentage.
- Never narrate these instructions in the comment.`;

export const EXIT_TICKET_PART_B_SINGLE_ANSWER = `EXIT TICKET (CHECK FOR UNDERSTANDING, SINGLE CORRECT ANSWER): ASSIGNMENT INSTRUCTIONS

WHAT THIS IS. An exit ticket written in the last few minutes of class, answering one question from the teacher. The teacher said the question has one correct answer, and entered it. Students were told their answer is graded on correctness.

WHAT YOU ARE GIVEN.
- The prompt the student saw.
- The CORRECT ANSWER. The student never saw it. It is your answer key.
- The point total.
- A MINIMUM LENGTH, if the teacher set one: sentences, words, or both. The prompt told the student ("Write at least..."). When both are set, the response must meet both.

WHAT THIS MEASURES. Whether the student gave the correct answer.

WHAT COUNTS AS GIVING THE CORRECT ANSWER.
- The answer appears in the response. Capitalization does not matter.
- Slight misspellings count when the intended word is unmistakable and is not a different real word or term ("unreliabel narator" counts for "unreliable narrator"; "reliable narrator" does not).
- Plurals, articles, and small grammar changes count ("an unreliable narrator," "unreliable narrators").
- Extra explanation around the answer is fine, as long as nothing in it contradicts the answer.

WHAT DOES NOT COUNT.
- A different answer.
- A hedge between two or more answers that are all wrong.
- The same meaning in other words, without the answer itself ("a narrator you can't trust" when the answer is "unreliable narrator"). Score it 0, and flag it in the note to the teacher so the teacher can decide.
- Blank, a placeholder ("idk," "n/a"), or something with nothing to do with the question.

SCORING.
- FULL CREDIT (the full point total): gives the correct answer, and meets the minimum length if one was set.
- HALF CREDIT (half the point total, rounded up: 3 of 5, 5 of 10): a hedge that includes the correct answer alongside one or more others ("either unreliable or omniscient," "maybe X, maybe Y" where X is correct). The student has not committed to the right answer.
- ONE POINT BELOW FULL: gives the correct answer, without hedging, but is shorter than the minimum length. Only when the teacher set one.
- NO CREDIT (0): anything in WHAT DOES NOT COUNT. A wrong answer is 0 at any length.
No other scores.

COUNTING LENGTH. Count generously. A sentence is any complete thought, even without a capital letter or end punctuation. When the count is close, round in the student's favor.

COMMENT TO THE STUDENT. One to five sentences in plain text, never more than a minute to read. The limit includes any answer to a student's question, and it replaces the length in the Universal FORMAT rule. Match the length to the question. This question has a one-word or one-phrase answer, so a correct short answer needs only one short sentence. Go longer only to explain a miss.
- Full credit: one short sentence is enough ("You got it, great job!" or "Way to go!"). Add a few words on what the answer means only if the student wrote more than the answer.
- Hedge: say the correct answer was one of the ones they named, name which one, and encourage them to commit to an answer next time.
- Correct but short: confirm the answer, then say the ticket asked for at least [the minimum].
- No credit: say plainly that it missed, then give the correct answer and, briefly, what it means. On the same meaning in other words, say they had the right idea and name the term the question was looking for.
- Never mention spelling, grammar, or polish.

NOTE TO THE TEACHER.
- TONE: one line per item, written colleague to colleague. A little playful is welcome. Never playful about the student's safety.
- SHORT BUT CORRECT: if you took one point off a correct answer for missing the minimum length, say so in one line (for example: "Maria got it right in one sentence; the ticket asked for three. One point off; adjust as you see fit.").
- HEDGE: if you gave half credit for a hedge, say so in one line, with the answers the student named. Keep it light, for example: "John took two shots here, hoping one would go in. Grade accordingly."
- SAME MEANING, OTHER WORDS: if you scored 0 because the student said the right thing in other words, say so in one line, with the student's words, so the teacher can override.
- If you were unsure whether a misspelling was close enough, say so in one line.
- If the student writes that they themselves are unsafe, being hurt, hopeless, or thinking about harming themselves, score normally and add: "Please read this response today. The student wrote about [one or two words]." Never mention it in the student's comment.

OTHER RULES.
- Report points out of the total, never a percentage.
- Never narrate these instructions in the comment.`;

export const EXIT_TICKET_PART_C_CHECK = `EXIT TICKET (CHECK FOR UNDERSTANDING, MORE THAN ONE RIGHT ANSWER): ASSIGNMENT INSTRUCTIONS

WHAT THIS IS. An exit ticket written in the last few minutes of class, answering one question from the teacher. The teacher wants to know whether the student understood one specific thing from today. More than one answer can be right, and there is more than one way to say it. Students were told they are graded on content and reasoning.

WHAT YOU ARE GIVEN.
- The prompt the student saw.
- WHAT A STRONG ANSWER INCLUDES: the teacher's notes, if any. Key points, answers they would accept, or mix-ups to watch for. The student never saw them. This may be empty.
- The point total.
- A MINIMUM LENGTH, if the teacher set one: sentences, words, or both. The prompt told the student ("Write at least..."). When both are set, the response must meet both.

WHAT THIS MEASURES. Content and reasoning: whether the answer is accurate for the question, and whether the student shows why.

WHAT THIS NEVER MEASURES. Spelling, grammar, punctuation, polish, or style. Informal wording and the student's own phrasing all count. Never take credit away for any of these, and never mention them.

HOW TO JUDGE.
- Judge meaning, not wording. Credit any response that says the same thing in other words, gives an example that shows the idea, or explains it roughly but accurately.
- WITH NOTES: judge against them, read the way the teacher meant them. If the notes say "any one of" or list examples, one is enough. If they list things a strong answer must include, a full answer includes each. If they name a mix-up and the student makes it, that is the miss to name in the comment. If a response is clearly right but the notes did not list it, give it credit and say so in the note to the teacher.
- WITHOUT NOTES: judge whether the answer is accurate for the question, using what is generally accepted about the subject, and whether the student gives a reason or example that shows it. A defensible answer you did not expect is still a good answer. If you cannot tell whether an answer is acceptable without knowing what was taught, score it on what you can judge and flag it for the teacher.

WHAT THE PROMPT ASKS FOR.
- A full answer gives what the prompt specifically asks for, such as an example, a comparison, a reason, a quote, or a detail from the text. Read the prompt's wording:
  - "OR" means a choice. "Give an example or a quote" is fully answered by either one. Never require all of the options.
  - "AND" means each one is required. "Explain what it means and give an example" needs both; with only one, the answer is partial.
  - The same goes for the teacher's notes: "any one of" or a list of examples means one is enough.
- When the prompt asks about a text or source, the reading must be accurate to that text.
- Repeating the key words of the question, or a memorized definition, with nothing that shows the student understands it, is partial at best.

SCORING. Three outcomes.
- FULL CREDIT (the full point total): accurate, with reasoning that shows understanding, covering what the notes ask for (if any) and anything the prompt specifically asks for, and meeting the minimum length if one was set.
- PARTIAL CREDIT (any whole number above 0 and below the full total): real understanding, but something is missing: part of the answer but not all, the right idea stated too vaguely to be sure, a claim with no reasoning, a missing quote or detail the prompt asked for, or a correct and complete answer that is shorter than the minimum length (one point below full).
  Scale the score to how much understanding shows. Nearly all of it: one point below full. About half: the middle of the range. A small piece: 1. On the default of 5 points, partial credit is 1, 2, 3, or 4.
- NO CREDIT (0): a wrong answer (contradicts the notes or what is accurate, or misses the point entirely), something with nothing to do with the question, blank, or a placeholder ("idk," "n/a"). A wrong answer is 0 at any length.

WRONG VERSUS OFF THE RAILS. Both score 0, but tell them apart in the comment. A wrong answer is a real attempt that landed in the wrong place: say so plainly and kindly, then say what a correct answer looks like, in your own words. Off the rails means the student did not engage with the question: point back to what it asked, then say what a correct answer looks like.

COUNTING LENGTH. Count generously. A sentence is any complete thought, even without a capital letter or end punctuation. When the count is close, round in the student's favor. Never reward length for its own sake when no minimum was set.

COMMENT TO THE STUDENT. One to five sentences in plain text, never more than a minute to read. The limit includes any answer to a student's question, and it replaces the length in the Universal FORMAT rule. Match the length to the question and the response. A short answer to a short question gets a short comment. An answer that shows opinion, reasoning, or a lot of engagement can get more, and so can a miss that needs a sentence on what a correct answer looks like.
- Full credit: name the specific thing they got right.
- Partial credit: name what they got right, then the one thing missing (the second point, the reason, the quote, the length).
- No credit: say plainly that it missed, then what a correct answer looks like, briefly. Don't reteach the whole lesson.
- Never mention spelling, grammar, or polish.

NOTE TO THE TEACHER.
- TONE: one line per item, written colleague to colleague. A little playful is welcome. Never playful about the student's safety.
- SHORT BUT CORRECT: if you took one point off a correct answer for missing the minimum length, say so in one line (for example: "Maria got it right in one sentence; the ticket asked for three. One point off; adjust as you see fit.").
- If you credited an answer the notes did not list, say so in one line.
- If you were unsure whether an answer is acceptable, say so in one line.
- If the student writes that they themselves are unsafe, being hurt, hopeless, or thinking about harming themselves, score normally and add: "Please read this response today. The student wrote about [one or two words]." Never mention it in the student's comment.

OTHER RULES.
- Report points out of the total, never a percentage.
- Never narrate these instructions in the comment.`;

/** Part A, Part B, or Part C. */
export type ExitTicketGradingAssistantPart =
  | 'reflection'
  | 'single-answer'
  | 'check';

const NOT_PROVIDED = 'Not provided.';

export type ResolveExitTicketPointTotalOptions = {
  /** When true, missing totals fall back to the v2 assistant default (5). */
  v2Grading?: boolean;
};

/** Whole-number point total. Invalid values use the legacy (10) or v2 (5) default. */
export function resolveExitTicketPointTotal(
  pointValue: number | null | undefined,
  options: ResolveExitTicketPointTotalOptions = {}
): number {
  if (
    typeof pointValue === 'number' &&
    Number.isInteger(pointValue) &&
    pointValue >= 1
  ) {
    return pointValue;
  }
  return options.v2Grading
    ? EXIT_TICKET_V2_DEFAULT_POINT_VALUE
    : EXIT_TICKET_DEFAULT_POINT_VALUE;
}

/**
 * Which assistant runs. A ticket with no config is a reflection; a check is
 * Part B only when the teacher said it has a single correct answer.
 */
export function exitTicketGradingAssistantPart(
  config: ExitTicketConfig | null | undefined
): ExitTicketGradingAssistantPart {
  if (!config || exitTicketKind(config) !== 'check') return 'reflection';
  return config.singleCorrectAnswer === true ? 'single-answer' : 'check';
}

/** The question students saw. The stored assignment prompt wins. */
export function exitTicketStudentQuestion(
  config: ExitTicketConfig | null | undefined,
  studentPrompt?: string | null
): string {
  const stored = studentPrompt?.trim();
  if (stored) return stored;
  const written = config?.promptText?.trim();
  if (written) return written;
  if (config) return composeExitTicketPrompt(config);
  return NOT_PROVIDED;
}

/**
 * Answer key for a check. New field, then the legacy "must mention" note.
 * Empty means the teacher did not leave one; grading still runs.
 */
export function exitTicketCorrectAnswer(
  config: ExitTicketConfig | null | undefined
): string {
  const direct = config?.correctAnswer?.trim();
  if (direct) return direct;
  const legacy = config?.lessonNotes?.mustMention?.trim();
  if (legacy) return legacy;
  return NOT_PROVIDED;
}

/** True when the teacher set a minimum length in words or sentences. */
export function exitTicketHasMinimumLength(
  config: ExitTicketConfig | null | undefined
): boolean {
  return Boolean(config?.grading?.minWords || config?.grading?.minSentences);
}

function minimumLengthLine(
  config: ExitTicketConfig | null | undefined
): string {
  const words = config?.grading?.minWords;
  const sentences = config?.grading?.minSentences;
  const parts = [
    sentences ? `at least ${sentences} sentences` : null,
    words ? `at least ${words} words` : null,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return 'Minimum length: none.';
  return `Minimum length: ${parts.join(' and ')}.`;
}

/** The answer box for Part C, which may be empty. */
function strongAnswerNotes(
  config: ExitTicketConfig | null | undefined
): string {
  const answer = exitTicketCorrectAnswer(config);
  return answer === NOT_PROVIDED
    ? 'None. The teacher left this empty.'
    : answer;
}

const PART_TEXT: Record<ExitTicketGradingAssistantPart, string> = {
  reflection: EXIT_TICKET_PART_A_REFLECTION,
  'single-answer': EXIT_TICKET_PART_B_SINGLE_ANSWER,
  check: EXIT_TICKET_PART_C_CHECK,
};

export type ExitTicketGradingAssistantPromptInput = {
  config?: ExitTicketConfig | null;
  studentPrompt?: string | null;
  pointValue?: number | null;
  submitForGrade?: boolean | null;
};

/**
 * Universal block, then Part A, B, or C, then the facts for this ticket.
 * The pasted blocks are unchanged. Facts come after them.
 */
export function buildExitTicketGradingAssistantPrompt(
  input: ExitTicketGradingAssistantPromptInput = {}
): string {
  const part = exitTicketGradingAssistantPart(input.config);
  const pointTotal = resolveExitTicketPointTotal(input.pointValue, {
    v2Grading: true,
  });
  const question = exitTicketStudentQuestion(input.config, input.studentPrompt);
  const graded = input.submitForGrade !== false;
  const lines = [
    part === 'reflection'
      ? 'Exit ticket type: Reflection'
      : 'Exit ticket type: Check for understanding',
    ...(part === 'single-answer'
      ? ['Is there a single correct answer? Yes.']
      : part === 'check'
        ? ['Is there a single correct answer? No.']
        : []),
    'Prompt the students saw:',
    question,
    ...(part === 'single-answer'
      ? ['Correct answer:', exitTicketCorrectAnswer(input.config)]
      : part === 'check'
        ? ['What a strong answer includes:', strongAnswerNotes(input.config)]
        : []),
    `Point total: ${pointTotal}`,
    minimumLengthLine(input.config),
    graded
      ? 'Grade this ticket: yes.'
      : 'Grade this ticket: no. Still write the comment to the student and the note to the teacher. Nothing is recorded in the gradebook.',
  ];

  return [
    EXIT_TICKET_UNIVERSAL_BLOCK,
    PART_TEXT[part],
    ['THIS EXIT TICKET', ...lines].join('\n'),
  ].join('\n\n');
}

/**
 * Model scores land on a legal value for this part.
 * Reflection: 0 or the full total, unless a minimum length was set (then any
 *   whole number, for credit by length). A tie rounds to full credit.
 * Single answer: 0, half rounded up, the full total, and one below full when
 *   a minimum was set. The nearest wins; a tie goes up.
 * Check (Part C): any whole number from 0 through the total.
 */
export function clampExitTicketScore(
  raw: number,
  part: ExitTicketGradingAssistantPart,
  pointTotal: number,
  { hasMinimumLength = false }: { hasMinimumLength?: boolean } = {}
): number {
  const total = resolveExitTicketPointTotal(pointTotal, { v2Grading: true });
  if (!Number.isFinite(raw)) return 0;
  const bounded = Math.min(total, Math.max(0, Math.round(raw)));
  if (part === 'check') return bounded;
  if (part === 'reflection' && hasMinimumLength) return bounded;
  const legal =
    part === 'reflection'
      ? [0, total]
      : [
          0,
          Math.ceil(total / 2),
          ...(hasMinimumLength ? [total - 1] : []),
          total,
        ];
  return legal.reduce((best, value) =>
    Math.abs(value - bounded) <= Math.abs(best - bounded) ? value : best
  );
}

export type ExitTicketPersistedGrade = {
  comment: string;
  teacherNote: string | null;
  /** Null when the ticket is ungraded: feedback only, nothing in the gradebook. */
  gradebookScore: string | null;
  overallScore: number | null;
  numericPercentage: null;
  letterGrade: null;
};

/** What gets recorded. Ungraded keeps the comment and drops the gradebook score. */
export function exitTicketPersistedGrade({
  submitForGrade,
  earned,
  pointTotal,
  comment,
  teacherNote,
}: {
  submitForGrade: boolean;
  earned: number;
  pointTotal: number;
  comment: string;
  teacherNote: string | null;
}): ExitTicketPersistedGrade {
  if (!submitForGrade) {
    return {
      comment,
      teacherNote,
      gradebookScore: null,
      overallScore: null,
      numericPercentage: null,
      letterGrade: null,
    };
  }
  const total = resolveExitTicketPointTotal(pointTotal, { v2Grading: true });
  const points = Math.min(total, Math.max(0, Math.round(earned)));
  return {
    comment,
    teacherNote,
    gradebookScore: `${points}/${total}`,
    overallScore: points,
    numericPercentage: null,
    letterGrade: null,
  };
}

/** One category, scored in whole points. No four-band scale. */
export function exitTicketPointsCategory(pointTotal: number): RubricCategory {
  const total = resolveExitTicketPointTotal(pointTotal, { v2Grading: true });
  return {
    key: 'understanding',
    label: 'Understanding',
    weight: 1,
    description: `Points out of ${total} for this exit ticket. Follow the exit ticket grading instructions for what earns them.`,
    feedbackEnabled: false,
    grammarHighlighting: false,
  };
}

type ExitTicketGradingConfigSlice = {
  assignmentTypeKind: string | null;
  scoringType: string;
  minScore: number;
  maxScore: number;
  step: number;
  rubricCategories: RubricCategory[];
  instructions:
    | {
        mode: 'unified';
        gradingInstructions: string;
        systemInstructions?: string;
      }
    | {
        mode: 'preset';
        rubricInstructions: string;
        scoreInstructions: string;
        systemInstructions?: string;
      }
    | {
        mode: 'legacy-split';
        rubricInstructions: string;
        scoreInstructions: string;
        systemInstructions?: string;
      };
  rubricSnapshot: Record<string, unknown>;
  promptConfigSnapshot: Record<string, unknown>;
};

/**
 * Replaces whatever rubric and instructions the assignment type stored, so the
 * retired four-band text cannot run beside the new assistant. Other assignment
 * types are returned unchanged.
 */
export function applyExitTicketGradingAssistant<
  T extends ExitTicketGradingConfigSlice,
>(config: T, input: ExitTicketGradingAssistantPromptInput = {}): T {
  if (config.assignmentTypeKind !== EXIT_TICKET_ASSIGNMENT_TYPE_KIND) {
    return config;
  }
  const pointTotal = resolveExitTicketPointTotal(input.pointValue, {
    v2Grading: true,
  });
  const instructions = buildExitTicketGradingAssistantPrompt({
    ...input,
    pointValue: pointTotal,
  });
  const category = exitTicketPointsCategory(pointTotal);
  return {
    ...config,
    scoringType: 'rubric_points',
    minScore: 0,
    maxScore: pointTotal,
    step: 1,
    rubricCategories: [category],
    instructions: { mode: 'unified', gradingInstructions: instructions },
    rubricSnapshot: {
      ...config.rubricSnapshot,
      categories: [category],
      minScore: 0,
      maxScore: pointTotal,
      step: 1,
      scoringType: 'rubric_points',
    },
    promptConfigSnapshot: {
      ...config.promptConfigSnapshot,
      gradingInstructions: instructions,
      gradingInstructionsOverride: null,
    },
  };
}

function plainMinimum(config: ExitTicketConfig | null | undefined): string | null {
  const sentences = config?.grading?.minSentences;
  const words = config?.grading?.minWords;
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const parts = [
    sentences ? count(sentences, 'sentence') : null,
    words ? count(words, 'word') : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? `at least ${parts.join(' and ')}` : null;
}

/**
 * What the Grading Assistant grades for, in plain words, for the teacher's
 * "View rubric" (Brian, Nov 25). Built from the ticket the teacher made, so
 * it names their answer, notes, minimum, and points.
 */
export function exitTicketGradingPlainSummary(
  config: ExitTicketConfig | null | undefined,
  pointValue: number | null | undefined
): GradingRubricPlainSummary {
  const part = exitTicketGradingAssistantPart(config);
  const total = resolveExitTicketPointTotal(pointValue, { v2Grading: true });
  const minimum = plainMinimum(config);
  const half = Math.ceil(total / 2);
  const never = {
    label: 'Never counted',
    text: 'Spelling, grammar, and polish.',
  };

  if (part === 'reflection') {
    return {
      intro:
        'A reflection. The Grading Assistant looks for an honest answer to the prompt. There is no right or wrong answer.',
      rows: [
        {
          label: `Full credit (${total}/${total})`,
          text: minimum
            ? `Any honest engagement with the prompt or the lesson that is ${minimum} long. A question about the lesson counts.`
            : 'Any honest engagement with the prompt or the lesson. One real sentence counts, and so does a question about the lesson.',
        },
        ...(minimum
          ? [
              {
                label: 'Partial credit',
                text: `Honest, but shorter than ${minimum}. Credit is in proportion to how much was written, rounded up.`,
              },
            ]
          : []),
        {
          label: 'No credit (0)',
          text: 'Blank, a placeholder like “idk,” off topic, or only naming the topic (“Puritans”).',
        },
        {
          label: 'Student questions',
          text: 'Answered in the comment when the Grading Assistant can answer confidently, and always copied into your note.',
        },
        never,
      ],
    };
  }

  if (part === 'single-answer') {
    return {
      intro: `A check for understanding with one correct answer: “${exitTicketCorrectAnswer(config)}.”`,
      rows: [
        {
          label: `Full credit (${total}/${total})`,
          text: `Gives the correct answer${minimum ? ` and is ${minimum} long` : ''}. Capitalization doesn’t matter, and slight misspellings, plurals, and extra explanation are fine.`,
        },
        {
          label: `Half credit (${half}/${total})`,
          text: 'Hedges between the correct answer and others (“either X or Y”).',
        },
        ...(minimum
          ? [
              {
                label: `One point off (${total - 1}/${total})`,
                text: `Correct, but shorter than ${minimum}.`,
              },
            ]
          : []),
        {
          label: 'No credit (0)',
          text: 'A different answer, blank, or off topic. The right idea in other words also scores 0, and your note flags it so you can decide.',
        },
        never,
      ],
    };
  }

  const notes = exitTicketCorrectAnswer(config);
  return {
    intro:
      notes === NOT_PROVIDED
        ? 'A check for understanding with more than one right answer. You left no notes, so the Grading Assistant judges accuracy against what is generally accepted about the subject.'
        : `A check for understanding with more than one right answer, judged against your notes: “${notes}”`,
    rows: [
      {
        label: `Full credit (${total}/${total})`,
        text: `Accurate, with reasoning that shows understanding, and anything the prompt asks for (an example, a quote)${minimum ? `, ${minimum} long` : ''}.`,
      },
      {
        label: 'Partial credit',
        text: `Real understanding with something missing, scaled to how much shows (1 to ${total - 1}).${minimum ? ` Correct but shorter than ${minimum} is one point off.` : ''}`,
      },
      {
        label: 'No credit (0)',
        text: 'Wrong, off topic, or blank.',
      },
      never,
    ],
  };
}

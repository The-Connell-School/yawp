/**
 * Content-safety screen for AI-generated writing-practice items.
 *
 * The practice panel refreshes forever by generating fresh sentences from an
 * LLM, so every item a student sees must be school-appropriate without a human
 * in the loop. The model is also instructed to stay age-appropriate (see the
 * generation system prompt), but a model instruction is a soft guarantee. This
 * deterministic screen is the hard gate: any generated item that trips it is
 * dropped before it can reach a student.
 *
 * This is intentionally a denylist of unambiguous, clearly-inappropriate terms
 * matched on word boundaries. It is not a complete moderation system — it will
 * not catch every possible phrasing — but it guarantees that none of the
 * blocked terms below ever surface, while avoiding false positives on ordinary
 * classroom vocabulary (e.g. "class", "assign", "shoot a free throw").
 */

// Word-boundary-matched terms grouped by why they are inappropriate for a
// high-school writing drill. Keep entries lowercase; matching is case-insensitive.
const BLOCKED_TERMS: string[] = [
  // Profanity and vulgar insults
  'fuck',
  'fucking',
  'motherfucker',
  'shit',
  'bullshit',
  'asshole',
  'dumbass',
  'jackass',
  'bitch',
  'bastard',
  'dick',
  'douche',
  'piss',
  'damn',
  'damned',
  'goddamn',
  'cunt',
  'twat',
  'wanker',
  'bollocks',
  'prick',
  // Slurs (a non-exhaustive core set)
  'nigger',
  'faggot',
  'retard',
  'spic',
  'chink',
  'kike',
  // Sexual content
  'sex',
  'sexual',
  'porn',
  'pornography',
  'nude',
  'nudes',
  'naked',
  'boobs',
  'penis',
  'vagina',
  'orgasm',
  'masturbate',
  'horny',
  'blowjob',
  'rape',
  'rapist',
  // Violence and weapons in a harmful context
  'kill',
  'killing',
  'murder',
  'stab',
  'stabbed',
  'shoot him',
  'shoot her',
  'shot him',
  'shot her',
  'gun',
  'gunshot',
  'behead',
  'slaughter',
  'massacre',
  'lynch',
  // Self-harm
  'suicide',
  'suicidal',
  // Drugs and alcohol
  'cocaine',
  'heroin',
  'meth',
  'weed',
  'marijuana',
  'drunk',
  'drunken',
  'vodka',
  'whiskey',
  'beer',
  'overdose',
];

// Multi-word entries need their internal spaces preserved; single words get a
// word boundary on each side so "ass" never matches inside "class" or "pass".
const BLOCKED_PATTERNS: RegExp[] = BLOCKED_TERMS.map((term) => {
  const escaped = term
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i');
});

/**
 * Returns true when the text is safe to show to a student: non-blank and free
 * of any blocked term. Blank text returns false — an empty prompt is useless.
 */
export function isSchoolAppropriate(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return !BLOCKED_PATTERNS.some((pattern) => pattern.test(trimmed));
}

type PromptLike = { exercise: string; instruction: string };

/**
 * Keeps only the prompts whose exercise AND instruction are school-appropriate.
 * Callers fall back to the static, human-authored bank when this returns fewer
 * items than requested (or none).
 */
export function filterAppropriatePrompts<T extends PromptLike>(
  prompts: T[]
): T[] {
  return prompts.filter(
    (prompt) =>
      isSchoolAppropriate(prompt.exercise) &&
      isSchoolAppropriate(prompt.instruction)
  );
}

type ActQuestionLike = {
  sentence: string;
  choices: string[];
  explanation: string;
};

/**
 * Keeps only the ACT questions whose every student-visible field — the
 * sentence, all answer choices, and the explanation — clears the safety screen.
 * A single off-policy choice drops the whole item, since students see all four.
 */
export function filterAppropriateActQuestions<T extends ActQuestionLike>(
  questions: T[]
): T[] {
  return questions.filter(
    (question) =>
      isSchoolAppropriate(question.sentence) &&
      isSchoolAppropriate(question.explanation) &&
      question.choices.every((choice) => isSchoolAppropriate(choice))
  );
}

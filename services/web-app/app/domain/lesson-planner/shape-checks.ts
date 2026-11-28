/**
 * The shape of a lesson, checked (section 1 of the rules; Nov 24 types test).
 *
 * S6, check understanding during the lesson, held in 2 of 10 lessons: most
 * asked a few volunteers ("Take five answers", "two or three answers"), and
 * almost none said what to do if the class missed it. S4, model first, held in
 * 4 of 10: Of Mice and Men had students "mark one detail about George" with no
 * think-aloud on a sentence first. Both rules are in the instructions; these
 * checks find a lesson that still misses them and send it to the repair pass,
 * which adds the check or the model where the lesson needs it.
 */
import { readPlanSteps, type PlanStep } from './plan-steps';

export type ShapeProblem = { what: string; words: string; note: string };

/** A question everyone answers at once. */
const EVERYONE =
  /\b(?:every(?:one|body)|every student|all students|each student|the whole class)\b[^.\n]{0,60}\b(?:answers?|writes?|jots?|holds? up|shows?|votes?|responds?|points?)\b|\b(?:hold up (?:fingers|a card|one|two|their)|fingers|thumbs (?:up|down)|(?:mini[- ]?)?whiteboards?|on a scrap|sticky notes?|show me|hinge question|all at once|at the same time|poll|cold call (?:everyone|the room))\b/i;

/** What to do if most of the class misses it. */
const IF_MISSED =
  /\bif (?:most|more than half|half|many|several|the room|the class|a lot of|few|nobody|no one)\b[^.\n]{0,80}\b(?:miss|misses|missed|struggle|wrong|split|confus|can[’']?t|cannot|don[’']?t|only|stuck|not up)/i;

/** Teaching that a check should follow: direct teaching or a first read. */
const TEACHES = /\b(?:context|mini[- ]?lesson|teach|direct instruction|define|terms?|read(?:ing)?|background|introduce)\b/i;

/** A teacher model, thinking aloud. */
const MODEL =
  /\bthink(?:s|ing)?[- ]aloud\b|\bI do\b|\bmodel(?:s|ing|ed)?\b[^.\n]{0,60}\b(?:annotat|underlin|mark|analy|writ|draft|sentence|line|paragraph|claim|fix|first)|\bmodel (?:it|this|one|the first|first)\b|\bwatch the fix\b|\bdo the first one\b|\bworked example\b|\bshows? (?:them|students|the class) how\b/i;

/** A step where students close-read or write at length: its title says so, and students do it. */
const TRY_TITLE = /\b(?:read\w*|annotat\w*|close|analy\w*|response|writ\w*|draft\w*|practice|activity|apply|your turn|you do)\b/i;
const TRY_ACT =
  /\b(?:students?|pairs?|they|everyone|groups?)\b[^.\n]{0,50}\b(?:annotat\w*|mark|underline|circle|highlight|label|write|writes|draft\w*|fix|correct)\b|(?:^|\n)\s*(?:[-*]\s*|\d+[.)]\s*)?\**(?:annotate|mark|underline|circle|highlight|write|draft)\b/i;
const NOT_THE_TRY = /\b(?:starter|exit|closing|before you go|wrap|warm[- ]?up|context|mini[- ]?lesson|direct teaching|background|vocabulary|words|agenda)\b/i;
/** Where in a step students try: their task, for checking that a model comes before it. */
const TRY = TRY_ACT;
const isUnit = (reply: string) => /```yawp-unit\b/.test(reply);

const headingOf = (reply: string, step: PlanStep) => {
  const start = step.at + (/^\s*/.exec(reply.slice(step.at, step.at + 8))?.[0].length ?? 0);
  const end = reply.indexOf('\n', start);
  return reply.slice(start, end < 0 ? reply.length : end).trim();
};

const stepText = (step: PlanStep) => `${step.title}\n${step.content}`;

/** S6: a lesson with teaching and no check everyone answers, or no plan for a miss. */
export function checkDuringProblems(reply: string): ShapeProblem[] {
  if (isUnit(reply)) return [];
  const steps = readPlanSteps(reply);
  if (steps.length < 3) return [];
  const teaching = steps.find((step) => TEACHES.test(step.title) && !/\b(?:starter|exit|closing|before you go)\b/i.test(step.title)) ?? steps.find((step) => TEACHES.test(stepText(step)));
  if (!teaching) return [];
  const everyone = EVERYONE.test(reply);
  const ifMissed = IF_MISSED.test(reply);
  if (everyone && ifMissed) return [];
  const missing = [
    ...(everyone ? [] : ['one question with a right answer that everyone answers at once (on a mini-whiteboard, a scrap of paper or fingers held up), not a few volunteers']),
    ...(ifMissed ? [] : ['what to do if most of the class misses it (reteach it another way, reread the passage together)']),
  ];
  return [
    {
      what:
        `The lesson never checks understanding during the lesson. After the direct teaching in "${teaching.title}", and after the first read, add a quick check: ${missing.join(', and ')}. ` +
        'Ask about what was just taught (a term, who is who, what happened), not an interpretation. Put it in the plan step, and in the speaker notes of the slide it follows.',
      words: headingOf(reply, teaching),
      note: `No quick check after “${teaching.title}”: add one question everyone answers at once, and what to do if most of the class misses it.`,
    },
  ];
}

/** S4: the first close reading or main writing with no teacher model at or before it. */
export function modelFirstProblems(reply: string): ShapeProblem[] {
  if (isUnit(reply)) return [];
  const steps = readPlanSteps(reply);
  if (steps.length < 3) return [];
  const first = steps.findIndex((step) => !NOT_THE_TRY.test(step.title) && TRY_TITLE.test(step.title) && TRY_ACT.test(step.content));
  if (first < 0) return [];
  const step = steps[first]!;
  // A model in an earlier step, or in this one before the students' task.
  const earlier = steps.slice(0, first).some((s) => MODEL.test(stepText(s)));
  const text = stepText(step);
  const tryAt = text.search(TRY);
  const modelAt = text.search(MODEL);
  if (earlier || (modelAt >= 0 && modelAt <= tryAt)) return [];
  return [
    {
      what:
        `Students close-read or write in "${step.title}" with no model first. Before they try, the teacher shows how on two lines or one sentence, thinking aloud ("I'd underline this because…"), then the class does one together, then students try alone. ` +
        'For a writing task the teacher composes a sentence live, choosing aloud. Add it at the start of that step, in the plan and in the slide\'s speaker notes.',
      words: headingOf(reply, step),
      note: `No model before students try in “${step.title}”: add a short think-aloud first.`,
    },
  ];
}

/**
 * The writing on the slides is the writing in the stack (round 3, Nov 22: the
 * class starter on slide 3 was not the one "Add everything" filed, and the
 * Short Response students saw was not the one assigned). After the reply, a
 * write slide for the class starter or the Short Response shows the prompt
 * that "Add everything" files for it, word for word.
 */
import { readDailyPagesExercises, dailyPagesBlockKey, type DailyPagesExercise } from './daily-pages-block';
import { keepAllPlan } from './reply-pieces';
import { fenceSlideDeck, readSlideDeck, validateSlideDeck, type Slide } from './slide-deck';

const STARTER = /starter|warm[- ]?up|quick ?write|do now/i;
const RESPONSE = /short response|daily pages|response|write/i;

/** The prompt each routine files: the first kept class starter, and the first kept Short Response. */
function filedPrompts(reply: string): { starter: DailyPagesExercise | null; response: DailyPagesExercise | null } {
  const kept = new Set(keepAllPlan(reply).keys);
  const exercises = readDailyPagesExercises(reply).exercises;
  const filed = exercises.filter((_, index) => kept.has(dailyPagesBlockKey(index)));
  return {
    starter: filed.find((exercise) => exercise.kind === 'class-starter') ?? null,
    response: filed.find((exercise) => exercise.kind === 'daily-pages') ?? null,
  };
}

const MAX_WRITE_BODY = 320;

/** The reply with its write slides showing the prompts that are filed; any doubt leaves it as it was. */
export function withWriteSlidesAsFiled(reply: string): string {
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck') return reply;
  const { starter, response } = filedPrompts(reply);
  if (!starter && !response) return reply;
  let starterDone = false;
  let responseDone = false;
  let changed = false;
  const slides = outcome.deck.slides.map((slide): Slide => {
    if (slide.layout !== 'write') return slide;
    const label = `${slide.routine ?? ''} ${slide.title ?? ''}`;
    let prompt: DailyPagesExercise | null = null;
    if (!starterDone && starter && STARTER.test(label)) {
      prompt = starter;
      starterDone = true;
    } else if (!responseDone && response && !STARTER.test(label) && RESPONSE.test(label) && !/exit/i.test(label)) {
      prompt = response;
      responseDone = true;
    }
    if (!prompt || prompt.prompt.length > MAX_WRITE_BODY || slide.body === prompt.prompt) return slide;
    changed = true;
    return { ...slide, body: prompt.prompt };
  });
  if (!changed) return reply;
  const deck = { ...outcome.deck, slides };
  if (!validateSlideDeck(JSON.stringify(deck)).ok) return reply;
  return `${outcome.body.trim()}\n\n${fenceSlideDeck(deck)}`;
}

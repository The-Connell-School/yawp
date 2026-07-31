import type { ApEnglishLitFrqType, ApEnglishLitSnapshot } from './schema';
import { buildApEnglishLitCoachingBlock } from '../../../../../packages/prisma/scripts/ap-english-lit-coach-block';

// The coaching block -- posture, principles, rubric, register -- is authored in
// packages/prisma so the seed can write it into the database. Re-exported so
// the rest of the app keeps importing the coach from one place.
export {
  AP_ENGLISH_LIT_COACH_PRINCIPLES,
  buildApEnglishLitCoachingBlock,
} from '../../../../../packages/prisma/scripts/ap-english-lit-coach-block';

const FRQ_TYPE_GUIDANCE: Record<ApEnglishLitFrqType, string> = {
  poetry: [
    'This is the poetry analysis question (Q1). The student has a complete poem in front of them.',
    'Coach a two-pass reading: an exploration read for insight and the prompt\'s angle, then excavation reads that mine the poem for specific evidence.',
    'Draw attention to diction, imagery, figurative language, sound, form, and the movement of the speaker\'s attitude across the whole poem — not just the opening lines.',
  ].join(' '),
  prose: [
    'This is the prose fiction analysis question (Q2). The student has a passage of prose fiction or drama in front of them.',
    'Coach a two-pass reading: an exploration read for the passage\'s meaning and the prompt\'s angle, then excavation reads for specific evidence.',
    'Draw attention to characterization, narrative perspective, tone, structure, and shifts across the passage.',
  ].join(' '),
  literary_argument: [
    'This is the literary argument question (Q3), the open question. No text is provided; the student chooses a work of literary merit from memory.',
    'Help the student pick a defensible work and retrieve specific evidence from it. Do not invent plot details, characters, or quotations — if you are unsure, ask the student to supply and verify the evidence themselves.',
    'Coach them to build an interpretation of the work as a whole, not a plot summary.',
  ].join(' '),
};

function renderProvidedText(snapshot: ApEnglishLitSnapshot): string {
  if (snapshot.sources.length === 0) return '';
  const blocks = snapshot.sources.map((source) => {
    const heading = `Provided passage: ${source.title} (${source.attribution})`;
    return `${heading}\n${source.body}`;
  });
  return `\n\n${blocks.join('\n\n')}`;
}

function renderSuggestedWorks(snapshot: ApEnglishLitSnapshot): string {
  if (snapshot.suggestedWorks.length === 0) return '';
  const list = snapshot.suggestedWorks.map((work) => `- ${work}`).join('\n');
  return [
    '\n\nSuggested works (offer these as options if the student is stuck choosing; they are free to use another work of literary merit):',
    list,
  ].join('\n');
}

function renderTimeBudget(snapshot: ApEnglishLitSnapshot): string {
  const minutes = snapshot.timing.durationMinutes;
  const mode = snapshot.timing.mode === 'timed' ? 'timed' : 'untimed';
  return [
    `\n\nThis is a ${mode} response with a ${minutes}-minute budget. Coach the exam time plan:`,
    'about 6-8 minutes reading/annotating (or planning for Q3), a few minutes shaping a defensible thesis and a rough plan, the bulk of the time drafting, and a final couple of minutes rereading for clarity.',
  ].join(' ');
}

/**
 * Composes the full system instructions for the AP Literature coach on a
 * specific assignment snapshot: the coaching block (stored or authored) plus
 * the parts that can only come from this assignment — the question-type
 * guidance, the prompt, the provided text or suggested works, and the timing.
 */
export function buildApEnglishLitCoachInstructions(params: {
  snapshot: ApEnglishLitSnapshot;
  /**
   * The coaching block as stored on the assignment module and edited in admin.
   * Blank or missing falls back to the authored default, so an unseeded
   * environment behaves exactly as a seeded one.
   */
  coachingBlock?: string | null;
}): string {
  const { snapshot, coachingBlock } = params;

  const promptBlock = `Prompt the student is answering:\n${snapshot.prompt}`;

  return [
    coachingBlock?.trim() || buildApEnglishLitCoachingBlock(),
    '',
    'Before drafting, require prompt deconstruction: have the student restate the prompt as guiding questions so they answer what is actually asked.',
    '',
    FRQ_TYPE_GUIDANCE[snapshot.frqType],
    '',
    promptBlock + renderProvidedText(snapshot) + renderSuggestedWorks(snapshot),
    renderTimeBudget(snapshot),
  ].join('\n');
}

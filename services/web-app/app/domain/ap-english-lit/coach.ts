import { AP_ENGLISH_LIT_RUBRIC } from './rubric';
import type { ApEnglishLitFrqType, ApEnglishLitSnapshot } from './schema';

/**
 * The non-negotiable posture of the AP Literature coach. These principles are
 * a direct translation of expert-teacher practice: the tutor coaches the
 * student to see what an expert reader sees — it never does the thinking for
 * them and it never hands over finished analytical prose.
 */
export const AP_ENGLISH_LIT_COACH_PRINCIPLES: readonly string[] = [
  'Coach, do not ghostwrite. Do not write the thesis, a paragraph, or the essay for the student. Ask questions, reflect their own words back, and prompt them toward the next move.',
  'Teach to the rubric, transparently. Tie every piece of feedback to a specific rubric row (Thesis, Evidence and Commentary, or Sophistication) and name which one you are working on.',
  'Reframe summary into argument. When the student narrates what the text says, respond with "so what does that choice do?" until they stop describing and start interpreting.',
  'Protect the line of reasoning. Treat the argument as a single thread that must run through every paragraph back to the thesis; flag where it drops out and ask the student to restore it.',
  'Question before answer. On any weak spot, ask a prompting question first. Only if the student is genuinely stuck do you model one possibility, clearly framed as an example to learn from, never as text to paste.',
  'Be warm and honest. Praise interpretive risk even when imperfect, name the one or two highest-leverage fixes rather than burying the student in corrections, and say when a draft is genuinely borderline instead of inventing false precision.',
];

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

function renderRubricSummary(): string {
  return AP_ENGLISH_LIT_RUBRIC.rows
    .map(
      (row) =>
        `Row ${row.label} — ${row.title} (0-${row.maxPoints}): ${row.description}`,
    )
    .join('\n');
}

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
 * specific assignment snapshot: the fixed coaching posture, the shared 6-point
 * rubric, the question-type guidance, and the provided text (Q1/Q2) or
 * suggested works (Q3).
 */
export function buildApEnglishLitCoachInstructions(params: {
  snapshot: ApEnglishLitSnapshot;
}): string {
  const { snapshot } = params;

  const header =
    'You are an expert AP English Literature and Composition writing coach. ' +
    'Your job is to teach the student to see what an expert reader sees, and to move them up the rubric — not to write for them.';

  const principles = AP_ENGLISH_LIT_COACH_PRINCIPLES.map(
    (principle, index) => `${index + 1}. ${principle}`,
  ).join('\n');

  const promptBlock = `Prompt the student is answering:\n${snapshot.prompt}`;

  return [
    header,
    '',
    'Coaching principles (always follow):',
    principles,
    '',
    'The scoring rubric (all three questions share this 6-point analytic rubric):',
    renderRubricSummary(),
    '',
    'Before drafting, require prompt deconstruction: have the student restate the prompt as guiding questions so they answer what is actually asked.',
    '',
    FRQ_TYPE_GUIDANCE[snapshot.frqType],
    '',
    promptBlock + renderProvidedText(snapshot) + renderSuggestedWorks(snapshot),
    renderTimeBudget(snapshot),
  ].join('\n');
}

import { SYNTHESIS_SOURCE_RULES } from './rubric';
import type { ApEnglishLangFrqType, ApEnglishLangSnapshot } from './schema';
import { buildApEnglishLangCoachingBlock } from '../../../../../packages/prisma/scripts/ap-english-lang-coach-block';

// The coaching block -- posture, principles, rubric, register -- is authored in
// packages/prisma so the seed can write it into the database. Re-exported so
// the rest of the app keeps importing the coach from one place.
export {
  AP_ENGLISH_LANG_COACH_PRINCIPLES,
  buildApEnglishLangCoachingBlock,
} from '../../../../../packages/prisma/scripts/ap-english-lang-coach-block';

const FRQ_TYPE_GUIDANCE: Record<ApEnglishLangFrqType, string> = {
  synthesis: [
    'This is the synthesis question (Q1). The student has a packet of provided sources in front of them, at least one of which is a visual.',
    `Row B carries a hard source floor: a response must use at least ${SYNTHESIS_SOURCE_RULES.minSourcesForOnePoint} sources to earn 1 point and at least three to earn 2 or more. Make sure the student knows this — it is the single most common way a strong essay gets capped.`,
    'The sources are evidence for the student\'s argument, not the subject of it. Coach against "walking through the sources" one per paragraph; push for paragraphs organized by reasons, with sources marshalled together in support.',
    'Require correct in-text citation (Source A, or the attribution given). Coach the student to read the visual as an argument too, not as decoration.',
  ].join(' '),
  rhetorical_analysis: [
    'This is the rhetorical analysis question (Q2). The student has one nonfiction passage in front of them.',
    'The prompt asks about the writer\'s rhetorical CHOICES, not a hunt for named devices. A response that labels ethos, pathos, logos, or a list of devices without explaining effect on the audience is capped at 2 on Row B.',
    'Coach the student to establish the rhetorical situation first — writer, audience, occasion, purpose — and then explain how specific choices serve that purpose.',
    'Row B 4 requires explaining how MULTIPLE choices contribute to the writer\'s argument, purpose, or message. One choice explained beautifully tops out at 3.',
  ].join(' '),
  argument: [
    'This is the argument question (Q3), the open question. No text is provided; the student argues from their own reading, observation, and experience.',
    'Do not invent facts, statistics, historical details, or quotations for the student. If a claim needs evidence, ask the student to supply it and to verify it themselves.',
    'Coach against vague evidence — "studies show", "many people believe". Push for specific, named examples the student actually knows.',
    'The strongest responses qualify the position rather than defending an absolute. Help the student find the genuine tension in the prompt rather than picking a side and shouting it.',
  ].join(' '),
};


function renderProvidedSources(snapshot: ApEnglishLangSnapshot): string {
  if (snapshot.sources.length === 0) return '';

  const label =
    snapshot.frqType === 'synthesis' ? 'Provided source' : 'Provided passage';

  const blocks = snapshot.sources.map((source) => {
    const heading = `${label} ${source.position}: ${source.title} (${source.attribution})`;
    if (source.mediaType === 'image') {
      const description = source.imageAlt ?? source.caption ?? 'Visual source.';
      return `${heading}\n[Visual source] ${description}\n${source.body}`;
    }
    return `${heading}\n${source.body}`;
  });

  return `\n\n${blocks.join('\n\n')}`;
}

function renderSuggestedEvidence(snapshot: ApEnglishLangSnapshot): string {
  if (snapshot.suggestedEvidence.length === 0) return '';
  const list = snapshot.suggestedEvidence.map((item) => `- ${item}`).join('\n');
  return [
    '\n\nSuggested evidence domains (offer these only if the student is stuck; they are free to draw on anything they genuinely know):',
    list,
  ].join('\n');
}

function renderTimeBudget(snapshot: ApEnglishLangSnapshot): string {
  const minutes = snapshot.timing.durationMinutes;
  const mode = snapshot.timing.mode === 'timed' ? 'timed' : 'untimed';
  const readingNote =
    snapshot.frqType === 'synthesis'
      ? 'On the exam this question follows a 15-minute reading period for the source packet; coach the student to budget planning time the same way here.'
      : 'The exam allots a 15-minute reading period across the free-response section; coach the student to budget planning time before drafting.';

  return [
    `\n\nThis is a ${mode} response with a ${minutes}-minute budget. ${readingNote}`,
    'Coach the time plan: roughly 6-8 minutes reading and annotating, a few minutes shaping a defensible thesis and a rough plan, the bulk of the time drafting, and a final couple of minutes rereading for clarity.',
  ].join(' ');
}

/**
 * Composes the full system instructions for the AP Language coach on a
 * specific assignment snapshot: the coaching block (stored or authored) plus
 * the parts that can only come from this assignment — the question-type
 * guidance, the prompt, the provided sources or suggested evidence, and the
 * timing.
 */
export function buildApEnglishLangCoachInstructions(params: {
  snapshot: ApEnglishLangSnapshot;
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
    coachingBlock?.trim() || buildApEnglishLangCoachingBlock(),
    '',
    'Before drafting, require prompt deconstruction: have the student restate the prompt as guiding questions so they answer what is actually asked.',
    '',
    FRQ_TYPE_GUIDANCE[snapshot.frqType],
    '',
    promptBlock +
      renderProvidedSources(snapshot) +
      renderSuggestedEvidence(snapshot),
    renderTimeBudget(snapshot),
  ].join('\n');
}

// The assignment-independent half of the AP English Language tutor prompt.
//
// This lives in packages/prisma (not the web app) because the seed writes it
// into the module's tutorInstructions -- that DB row is what the admin Tutor
// settings screen shows and edits, and what the runtime reads -- and the
// production image ships packages/prisma without the web app's source.
//
// The web app re-exports these from app/domain/ap-english-lang/coach.ts, which
// adds the half that can only come from a specific assignment snapshot.

import { AP_ENGLISH_LANG_RUBRIC } from './ap-english-lang-rubric';
import {
  UNIVERSAL_TUTOR_BLOCK,
  formatRegisterModeDirective,
} from './universal-tutor-block';

/**
 * The non-negotiable posture of the AP Language coach. These principles are a
 * direct translation of expert-teacher practice: the tutor coaches the student
 * to argue like a rhetorician — it never does the thinking for them and it
 * never hands over finished analytical prose.
 */
export const AP_ENGLISH_LANG_COACH_PRINCIPLES: readonly string[] = [
  'Coach, do not ghostwrite. Do not write the thesis, a paragraph, or the essay for the student. Ask questions, reflect their own words back, and prompt them toward the next move.',
  'Teach to the rubric, transparently. Tie every piece of feedback to a specific rubric row (Thesis, Evidence and Commentary, or Sophistication) and name which one you are working on.',
  'Push from identification to explanation. When the student names a device, a source, or a fact, respond with "so what does that do for the argument?" until they stop labeling and start explaining effect.',
  'Protect the line of reasoning. Treat the argument as a single thread that must run through every paragraph back to the thesis; flag where it drops out and ask the student to restore it.',
  'Question before answer. On any weak spot, ask a prompting question first. Only if the student is genuinely stuck do you model one possibility, clearly framed as an example to learn from, never as text to paste.',
  'Be warm and honest. Praise argumentative risk even when imperfect, name the one or two highest-leverage fixes rather than burying the student in corrections, and say when a draft is genuinely borderline instead of inventing false precision.',
];

/**
 * Where the AP Lang principles above need narrowing against the universal
 * block. Both texts land in the same system prompt, so an unstated difference
 * leaves the tutor holding two instructions that disagree — and a student
 * arguing for help will always cite the looser one.
 */
const AP_ENGLISH_LANG_COACH_OVERRIDES = `HOW THESE PRINCIPLES SIT UNDER THE UNIVERSAL RULES ABOVE. The universal rules win wherever they are stricter. Two principles need narrowing:

- A MODELED EXAMPLE USES A DIFFERENT TEXT. Principle 5 lets you "model one possibility" when a student is genuinely stuck. On Q1 the student has the source packet in front of them and on Q2 the passage, so a modeled sentence about THOSE texts is precisely what they would paste into their essay. Any example you give must use a different, clearly unrelated topic and text — never the student's provided sources, passage, or their own argument on Q3. If you cannot make the example generic, ask a question instead.
- ONE NOTE PER TURN. Principle 6 says "one or two highest-leverage fixes." The universal rule is tighter and governs: pick the SINGLE most important thing for where this student is right now, say it briefly, and let them act before you raise anything else.

On mechanics: the AP Language rubric is additive and deducts nothing for errors. Coach register as reader-access ("will a reader follow this the way you mean it?"), and mechanics are never the one thing you raise in a turn.`;

function renderRubricSummary(): string {
  return AP_ENGLISH_LANG_RUBRIC.rows
    .map(
      (row) =>
        `Row ${row.label} — ${row.title} (0-${row.maxPoints}): ${row.description}`,
    )
    .join('\n');
}
/**
 * The assignment-independent half of the coach prompt: who the Tutor is, the
 * AP Lang posture, the shared rubric, how that rubric behaves, and the
 * register. It is the same for every AP Lang assignment, so it is what gets
 * seeded into the module's `tutorInstructions` -- which is what the admin
 * Tutor settings screen shows and edits, and what the runtime prefers over
 * this authored default.
 *
 * The universal block leads: this coach is the YAWP! Tutor first and an AP
 * Lang specialist second.
 */
export function buildApEnglishLangCoachingBlock(): string {
  const header =
    'THIS ASSIGNMENT: AP ENGLISH LANGUAGE. Everything above is who you are and holds here without exception. ' +
    'On top of it you are an expert AP English Language and Composition writing coach: your job is to teach the student to build and defend an argument the way an expert rhetorician does, and to move them up the rubric — not to write for them.';

  const principles = AP_ENGLISH_LANG_COACH_PRINCIPLES.map(
    (principle, index) => `${index + 1}. ${principle}`,
  ).join('\n');

  return [
    UNIVERSAL_TUTOR_BLOCK,
    header,
    ['Coaching principles (always follow):', principles].join('\n'),
    AP_ENGLISH_LANG_COACH_OVERRIDES,
    [
      'The scoring rubric (all three questions share this 6-point analytic rubric):',
      renderRubricSummary(),
    ].join('\n'),
    'The rubric is additive: each row is earned independently and nothing is deducted for errors. Be generous on grammar and minor factual slips unless they obscure meaning. Do not reward length — a short, tightly argued essay can earn every point. A response that does not address the prompt earns 0.',
    // One module covers reading, planning, drafting, and revising, and the
    // deliverable is a formal exam essay, so the register is POLISHED. While
    // the student is still annotating or planning they are thinking on paper;
    // mechanics are out of scope there, and never the single note anywhere.
    formatRegisterModeDirective('polished'),
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

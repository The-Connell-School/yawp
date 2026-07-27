// The assignment-independent half of the AP English Literature tutor prompt.
//
// This lives in packages/prisma (not the web app) because the seed writes it
// into the module's tutorInstructions -- that DB row is what the admin Tutor
// settings screen shows and edits, and what the runtime reads -- and the
// production image ships packages/prisma without the web app's source.
//
// The web app re-exports these from app/domain/ap-english-lit/coach.ts, which
// adds the half that can only come from a specific assignment snapshot.

import { AP_ENGLISH_LIT_RUBRIC } from './ap-english-lit-rubric';
import {
  UNIVERSAL_TUTOR_BLOCK,
  formatRegisterModeDirective,
} from './universal-tutor-block';

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
/**
 * Where the AP Lit principles above need narrowing against the universal
 * block. Both texts land in the same system prompt, so an unstated difference
 * leaves the tutor holding two instructions that disagree — and a student
 * arguing for help will always cite the looser one.
 */
const AP_ENGLISH_LIT_COACH_OVERRIDES = `HOW THESE PRINCIPLES SIT UNDER THE UNIVERSAL RULES ABOVE. The universal rules win wherever they are stricter. Two principles need narrowing:

- A MODELED EXAMPLE USES A DIFFERENT TEXT. Principle 5 lets you "model one possibility" when a student is genuinely stuck. On Q1 and Q2 the student has the poem or passage in front of them, so a modeled reading of THAT text is precisely what they would paste into their essay. Any example you give must analyse a different, clearly unrelated text — never the student's provided passage, and never their chosen work on Q3. If you cannot make the example generic, ask a question instead.
- ONE NOTE PER TURN. Principle 6 says "one or two highest-leverage fixes." The universal rule is tighter and governs: pick the SINGLE most important thing for where this student is right now, say it briefly, and let them act before you raise anything else.

On mechanics: the AP Literature rubric scores the argument, not the comma. Coach register as reader-access ("will a reader follow this the way you mean it?"), and mechanics are never the one thing you raise in a turn.`;
function renderRubricSummary(): string {
  return AP_ENGLISH_LIT_RUBRIC.rows
    .map(
      (row) =>
        `Row ${row.label} — ${row.title} (0-${row.maxPoints}): ${row.description}`,
    )
    .join('\n');
}
/**
 * The assignment-independent half of the coach prompt: who the Tutor is, the
 * AP Lit posture, the shared rubric, and the register. It is the same for
 * every AP Lit assignment, so it is what gets seeded into the module's
 * `tutorInstructions` — which is what the admin Tutor settings screen shows
 * and edits, and what the runtime prefers over this authored default.
 *
 * The universal block leads: this coach is the YAWP! Tutor first and an AP Lit
 * specialist second.
 */
export function buildApEnglishLitCoachingBlock(): string {
  const header =
    'THIS ASSIGNMENT: AP ENGLISH LITERATURE. Everything above is who you are and holds here without exception. ' +
    'On top of it you are an expert AP English Literature and Composition writing coach: your job is to teach the student to see what an expert reader sees, and to move them up the rubric — not to write for them.';

  const principles = AP_ENGLISH_LIT_COACH_PRINCIPLES.map(
    (principle, index) => `${index + 1}. ${principle}`,
  ).join('\n');

  return [
    UNIVERSAL_TUTOR_BLOCK,
    header,
    ['Coaching principles (always follow):', principles].join('\n'),
    AP_ENGLISH_LIT_COACH_OVERRIDES,
    [
      'The scoring rubric (all three questions share this 6-point analytic rubric):',
      renderRubricSummary(),
    ].join('\n'),
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

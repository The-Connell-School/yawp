// The AP English Literature course definition, in one place.
//
// Two seeds create this course: seed-ap-english-lit-library.ts (run against a
// real environment) and local-dev/seed-synthetic-data.ts (what local dev and
// preview deploys actually run). They restated the same assignment type,
// module, and instruction independently, and drifted: the synthetic seed built
// the module without `tutorInstructions`, so every locally seeded and preview
// environment showed an empty box on the admin Tutor settings screen even
// though the coaching block was authored and shipping.
//
// So the definition lives here and both seeds import it. Adding a field to the
// course means adding it once.

import { buildApEnglishLitCoachingBlock } from './ap-english-lit-coach-block';

export const AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY = 'ap_english_lit_essay';

export const AP_ENGLISH_LIT_ASSIGNMENT_TYPE_DATA = {
  title: 'AP English Literature Essay',
  description:
    'Curated AP Lit poetry, prose, and literary-argument practice with 6-point rubric coaching.',
  position: 51,
} as const;

// The module's tutorInstructions are the coaching block: the Universal YAWP!
// Tutor Instructions plus the AP Lit posture, rubric, and register. Seeding
// them is what makes the tutor visible and editable in admin Tutor settings;
// the runtime prefers this stored value and appends the assignment-specific
// half (prompt, provided text, timing) from the snapshot.
//
// Deliberately not `as const`: the seeds spread this object through
// withoutTutorInstructionFields, which needs a mutable shape.
export const AP_ENGLISH_LIT_MODULE_DATA = {
  title: 'AP English Literature Essay',
  position: 1,
  description:
    'Write an AP Lit free-response essay with rubric-anchored coaching.',
  tutorInstructions: buildApEnglishLitCoachingBlock(),
};

export const AP_ENGLISH_LIT_INSTRUCTION_DATA = {
  title: 'Write',
  prompt: 'Use the prompt and AP Literature coach to draft your response.',
  position: 1,
  showChatButton: true,
} as const;

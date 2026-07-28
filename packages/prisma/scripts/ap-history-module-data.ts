// Module-level data for the AP History Essay assignment type.
//
// The module's `tutorInstructions` is the General Tutor Instructions box shown in
// the admin view (Assignment Types -> AP History Essay -> Tutor settings -> module).
// It carries the canonical universal block; AP-specific substance belongs on the
// module's step instructions, not here.
import {
  UNIVERSAL_TUTOR_INSTRUCTIONS,
  ensureUniversalTutorInstructions,
} from './universal-tutor-instructions';

export const AP_HISTORY_MODULE_DATA = {
  title: 'AP History Essay',
  position: 1,
  description: 'Write an APUSH DBQ or LEQ with AP-specific coaching.',
  tutorInstructions: UNIVERSAL_TUTOR_INSTRUCTIONS,
} as const;

// Re-seeding must not clobber tutor wording an admin has since added in the UI,
// so the update path merges rather than overwrites.
export function buildApHistoryModuleUpdateData(
  existingTutorInstructions: string | null | undefined
) {
  return {
    ...AP_HISTORY_MODULE_DATA,
    tutorInstructions: ensureUniversalTutorInstructions(
      existingTutorInstructions
    ),
  };
}

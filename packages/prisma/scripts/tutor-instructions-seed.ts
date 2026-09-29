// Seeding tutor instructions without overwriting what an admin has typed.
//
// The tutor's prompt layers now live in the database so they can be edited in
// admin. That makes re-running a seed dangerous in a way it was not before: a
// blind upsert would silently revert somebody's edits on the next deploy.
//
// So the rule is seed-if-empty. A row that has never been populated gets the
// authored default; a row with content is left alone. Pushing new authored
// defaults over existing rows is possible but has to be asked for explicitly,
// by setting RESEED_TUTOR_INSTRUCTIONS=true.

export const TUTOR_INSTRUCTION_FIELDS = [
  'tutorInstructions',
  'tutorInstructionsVariantsJson',
] as const;

export type TutorInstructionField = (typeof TUTOR_INSTRUCTION_FIELDS)[number];

export type TutorInstructionValues = Partial<
  Record<TutorInstructionField, unknown>
>;

export function isReseedTutorInstructionsRequested(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.RESEED_TUTOR_INSTRUCTIONS === 'true';
}

// True when a stored column holds nothing an admin would recognise as content.
function isEmptyStoredValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// The tutor-instruction fields a seed should actually write to a row that
// already exists. Empty when the row is already populated and no re-seed was
// requested, which is what keeps admin edits.
export function tutorInstructionSeedUpdate(
  authored: TutorInstructionValues,
  existing: TutorInstructionValues,
  force: boolean = isReseedTutorInstructionsRequested()
): TutorInstructionValues {
  const update: TutorInstructionValues = {};

  for (const field of TUTOR_INSTRUCTION_FIELDS) {
    if (!(field in authored)) continue;
    if (force || isEmptyStoredValue(existing[field])) {
      update[field] = authored[field];
    }
  }

  return update;
}

// Strip the tutor-instruction fields out of a payload, leaving the fields a
// seed may always overwrite (title, position, description, and so on).
export function withoutTutorInstructionFields<
  T extends TutorInstructionValues,
>(fields: T): Omit<T, TutorInstructionField> {
  const rest = { ...fields };
  for (const field of TUTOR_INSTRUCTION_FIELDS) {
    delete rest[field];
  }
  return rest as Omit<T, TutorInstructionField>;
}

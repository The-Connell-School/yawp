// Where the tutor's prompt layers come from.
//
// Both layers of a tutor prompt -- the assignment-level General Tutor
// Instructions and the per-module/step guidance -- are stored in the database
// so admins can read and edit them. Code keeps the authored defaults, which
// the seeds write into those rows and which still answer when a row is empty.
//
// Precedence, for every layer:
//   1. the stored value (what admin shows and edits)
//   2. the code-authored default
//   3. for modules, the legacy single-string column
//
// The stored value and the code default are seeded identically, so turning
// this on changes nothing until a human actually edits something in admin.

import { z } from 'zod';

// The shape of the *VariantsJson columns: one authored string per variant key.
// AP History uses "dbq" and "leq"; other assignment types may use their own.
const VariantsSchema = z.record(z.string(), z.string());

export type TutorInstructionVariants = z.infer<typeof VariantsSchema>;

// Read one variant out of a *VariantsJson column. Returns null for absent,
// malformed, or blank entries so the caller falls through to its default --
// a hand-edited row must never be able to blank out the tutor's guidance.
export function readTutorInstructionVariant(
  variantsJson: unknown,
  variantKey: string
): string | null {
  const parsed = VariantsSchema.safeParse(variantsJson);
  if (!parsed.success) return null;
  const value = parsed.data[variantKey]?.trim();
  return value ? value : null;
}

// The first layer that actually has content. Blank and whitespace-only values
// are skipped rather than treated as an intentional override.
export function resolveTutorInstructions(
  ...layers: Array<string | null | undefined>
): string | null {
  for (const layer of layers) {
    const value = layer?.trim();
    if (value) return value;
  }
  return null;
}

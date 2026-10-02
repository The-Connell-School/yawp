// Per-variant tutor instruction textareas.
//
// Most assignment types have one set of tutor instructions per module or step.
// Some serve more than one flavour of the same step from a single row -- AP
// History runs the same four sections for both DBQ and LEQ essays -- and those
// rows store their guidance keyed by variant instead.
//
// This renders one textarea per variant the row actually carries, so an admin
// edits the same text the tutor reads. Rows without variants render nothing,
// which leaves every other assignment type's editor exactly as it was.

import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';

export const TUTOR_VARIANT_FIELD_PREFIX = 'tutorInstructionsVariant.';
export const TUTOR_VARIANT_KEYS_FIELD = 'tutorInstructionsVariantKeys';

// Human labels for the variant keys we know about. Unknown keys fall back to
// their raw key so a new course's variants still render something sensible.
const VARIANT_LABELS: Record<string, string> = {
  dbq: 'DBQ',
  leq: 'LEQ',
};

export function variantLabel(key: string): string {
  return VARIANT_LABELS[key] ?? key.toUpperCase();
}

// Pull the variant map off a stored JSON column, ignoring anything malformed.
export function readVariantEntries(
  variantsJson: unknown
): Array<[string, string]> {
  if (!variantsJson || typeof variantsJson !== 'object') return [];
  if (Array.isArray(variantsJson)) return [];

  return Object.entries(variantsJson as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort(([a], [b]) => a.localeCompare(b));
}

export function TutorInstructionVariantsEditor({
  variantsJson,
  description,
}: {
  variantsJson: unknown;
  description?: string;
}) {
  const entries = readVariantEntries(variantsJson);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label>Tutor instructions by essay type</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          {description ??
            'This step is used by more than one essay type. The tutor reads the version matching the student’s essay, so edit the one you mean.'}
        </p>
      </div>
      <input
        type="hidden"
        name={TUTOR_VARIANT_KEYS_FIELD}
        value={entries.map(([key]) => key).join(',')}
      />
      {entries.map(([key, value]) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={`${TUTOR_VARIANT_FIELD_PREFIX}${key}`}>
            {variantLabel(key)}
          </Label>
          <Textarea
            id={`${TUTOR_VARIANT_FIELD_PREFIX}${key}`}
            name={`${TUTOR_VARIANT_FIELD_PREFIX}${key}`}
            defaultValue={value}
            rows={10}
            className="font-mono text-xs"
          />
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        Clearing a box restores the built-in default for that essay type.
      </p>
    </div>
  );
}

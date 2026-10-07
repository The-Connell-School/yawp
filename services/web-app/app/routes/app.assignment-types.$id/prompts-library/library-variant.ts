/**
 * Which flavour of the open-ended prompt library an assignment type shows.
 *
 * The route has always picked this off the assignment type's title, which is
 * what teachers rename and what the library was keyed to before the split.
 * That stays; Class Starter simply joins Daily Pages as a title that gets the
 * library.
 *
 * The variant exists because the two mean different things to a teacher. A
 * Class Starter prompt is an open invitation to write, graded on effort. A
 * Daily Pages prompt sets a short piece that is graded formally — thinking,
 * structure, and grammar alike — so it reads a different corpus entirely.
 */
export const CLASS_STARTER_TITLE = 'class starter';
export const DAILY_PAGES_TITLE = 'daily pages';

export type PromptLibraryVariant = 'class-starter';

/**
 * The freewrite corpus in this folder is Class Starter material: its prompts
 * invite writing without asking for the backing a graded entry is scored on.
 * Class Starter is the only thing that reads it now.
 */
export type OpenEndedPromptLibraryVariant = Extract<
  PromptLibraryVariant,
  'class-starter'
>;

export function usesOpenEndedLibrary(
  variant: PromptLibraryVariant | null
): variant is OpenEndedPromptLibraryVariant {
  return variant === 'class-starter';
}

/** Short-form prompt library retired with the short-form rubric (2026-10). */
export function usesShortFormLibrary(_variant: PromptLibraryVariant | null) {
  return false;
}

export function resolvePromptLibraryVariant({
  title,
}: {
  title: string;
}): PromptLibraryVariant | null {
  const normalized = title.trim().toLowerCase();

  if (normalized === CLASS_STARTER_TITLE) return 'class-starter';
  if (normalized === DAILY_PAGES_TITLE) return 'class-starter';
  return null;
}

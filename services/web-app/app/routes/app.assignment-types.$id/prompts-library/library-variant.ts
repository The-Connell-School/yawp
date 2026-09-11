/**
 * Which flavour of the open-ended prompt library an assignment type shows.
 *
 * The route has always picked this off the assignment type's title, which is
 * what teachers rename and what the library was keyed to before the split.
 * That stays; Class Starter simply joins Daily Pages as a title that gets the
 * library.
 *
 * The variant exists because the two now mean different things to a teacher.
 * A Class Starter prompt is an open invitation to write, graded on effort. A
 * Daily Pages prompt, once the split is on, sets a short piece that is graded
 * formally — thinking, structure, and grammar alike. The prompts and the
 * generator are shared for now; the directions are not.
 */
export const CLASS_STARTER_TITLE = 'class starter';
export const DAILY_PAGES_TITLE = 'daily pages';

export type PromptLibraryVariant =
  | 'class-starter'
  | 'daily-pages-legacy'
  | 'daily-pages-graded';

export function resolvePromptLibraryVariant({
  title,
  dailyPagesSplitEnabled,
}: {
  title: string;
  dailyPagesSplitEnabled: boolean;
}): PromptLibraryVariant | null {
  const normalized = title.trim().toLowerCase();

  if (normalized === CLASS_STARTER_TITLE) return 'class-starter';
  if (normalized !== DAILY_PAGES_TITLE) return null;
  return dailyPagesSplitEnabled ? 'daily-pages-graded' : 'daily-pages-legacy';
}

import { resolvePromptLibraryVariant } from '~/routes/app.assignment-types.$id/prompts-library/library-variant';
import { isThesisDrivenEssayTitle } from './thesis-driven-essay';

export type HowItWorksGuide = 'thesis-essay' | 'daily-pages' | 'class-starter';

/**
 * Which "See how it works" guide an assignment type opens, if any. Picked off
 * the title, the same way its page picks its prompt library.
 */
export function howItWorksGuideFor(title: string): HowItWorksGuide | null {
  if (isThesisDrivenEssayTitle(title)) return 'thesis-essay';
  const variant = resolvePromptLibraryVariant({ title });
  if (variant === 'daily-pages-graded') return 'daily-pages';
  if (variant === 'class-starter') return 'class-starter';
  return null;
}

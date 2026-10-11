/**
 * Shared by the YAWP! tile deck template's two renderers — PowerPoint and
 * Present — so the two say the same thing (Brian's review, E1).
 */
import type { SlideLayout } from './slide-deck';

/** What each kind of slide is for, said small above its title. */
export const TILE_SLIDE_EYEBROWS: Record<SlideLayout, string> = {
  title: 'Today',
  statement: 'Hold this question',
  bullets: 'Notes',
  compare: 'Side by side',
  prompt: 'Your turn',
  steps: 'How it goes',
  quote: 'From the text',
  closing: 'Before you go',
};

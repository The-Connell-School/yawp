/**
 * How to Teach It on the How It Works pages (Kevin, Nov 10): the same
 * collapsible block as on Brian's landing pages, holding the same copy, so a
 * teacher reads one thing in both places.
 *
 * - Pre-Writing and Thesis Statement: their landing page's How to Teach It
 *   as it is, the lead and then the lesson's slide deck and tutorial video.
 * - Class Starter and Exit Ticket have no How to Teach It on their landing
 *   page; their How it works is the teaching how-to, so it is used here
 *   under the How to Teach It heading. Its first line points at the New
 *   button "above" and the library "below", which on this page are on the
 *   type's own page, so that line says so. Every other word is Brian's.
 */
import {
  LANDING_PAGES,
  type LandingBlock,
  type LandingSection,
} from '../app.assignment-types.$id/landing-copy/content';

export const GUIDE_HOW_TO_TEACH_KEYS = [
  'class-starter',
  'prewriting',
  'thesis-statement',
  'exit-ticket',
] as const;

export type GuideHowToTeachKey = (typeof GUIDE_HOW_TO_TEACH_KEYS)[number];

const TYPE_TITLE: Record<'class-starter' | 'exit-ticket', string> = {
  'class-starter': 'Class Starter',
  'exit-ticket': 'Exit Ticket',
};

function section(key: GuideHowToTeachKey, id: LandingSection['id']): LandingSection {
  const found = LANDING_PAGES[key].sections.find((s) => s.id === id);
  if (!found) throw new Error(`${key} has no ${id} section`);
  return found;
}

/** "Click **New** above …" and "… the Prompt Library below", said from the guide. */
function fromTheGuide(text: string, typeTitle: string): string {
  return text
    .replace(/^Click \*\*New\*\* above/, `On the ${typeTitle} page, click **New**`)
    .replace(/ from the Prompt Library below\./, ' from its Prompt Library.');
}

function adapt(block: LandingBlock, typeTitle: string): LandingBlock {
  if (block.type === 'paragraph') return { ...block, text: fromTheGuide(block.text, typeTitle) };
  if (block.type === 'bullets') {
    return { ...block, items: block.items.map((item) => fromTheGuide(item, typeTitle)) };
  }
  return block;
}

export function guideHowToTeachSection(key: GuideHowToTeachKey): LandingSection {
  if (key === 'prewriting' || key === 'thesis-statement') {
    return section(key, 'how-to-teach-it');
  }
  const howItWorks = section(key, 'how-it-works');
  return {
    id: 'how-to-teach-it',
    heading: 'How to Teach It',
    blocks: howItWorks.blocks.map((block) => adapt(block, TYPE_TITLE[key])),
  };
}

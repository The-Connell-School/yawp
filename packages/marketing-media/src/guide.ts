import type { MarketingStoryboard, StoryboardScene } from './storyboard';

/**
 * How-to guides as a studio deliverable.
 *
 * docs/how-to-guides.md is the house standard for the "See how it works"
 * pages: a teaser that gets a teacher to try a feature, not the manual. This
 * module holds that standard in code so a generated guide is held to it the
 * same way a hand-built one is reviewed against it:
 *
 * - `validateGuideStoryboard` enforces the shape (hero, range, at most three
 *   steps, extras, will / won't, honest footer). A storyboard that fails it
 *   cannot be rendered as a guide.
 * - `lintGuideCopy` catches the copy problems the review kept finding: em-dash
 *   asides, "not X, but Y", marketing filler, a missing Oxford comma, and
 *   YAWP! written any other way. These are style, so they send a draft back
 *   for another pass but never fail a job on their own.
 */

/** At most three numbered steps in the main workflow (docs/how-to-guides.md, Shape). */
export const MAX_GUIDE_STEPS = 3;
export const MAX_GUIDE_EXTRAS = 3;

export type GuideOutline = {
  hero: StoryboardScene | undefined;
  range: StoryboardScene | undefined;
  steps: StoryboardScene[];
  extras: StoryboardScene[];
};

/** The scenes in the order the guide shows them, whatever order they were filmed in. */
export function guideOutline(storyboard: MarketingStoryboard): GuideOutline {
  const inSection = (section: string) =>
    storyboard.scenes.filter((scene) => scene.guide?.section === section);
  return {
    hero: inSection('hero')[0],
    range: inSection('range')[0],
    steps: inSection('step'),
    extras: inSection('extra'),
  };
}

/** Shape problems that make a storyboard unusable as a guide. Empty means valid. */
export function validateGuideStoryboard(
  storyboard: MarketingStoryboard
): string[] {
  const problems: string[] = [];
  const guide = storyboard.guide;
  if (!guide) {
    problems.push(
      'a guide needs guide copy: headline, lede, will, won’t, and footerNote'
    );
  }

  const count = (section: string) =>
    storyboard.scenes.filter((scene) => scene.guide?.section === section);
  const heroes = count('hero');
  const ranges = count('range');
  const steps = count('step');
  const extras = count('extra');

  if (heroes.length !== 1) {
    problems.push(
      `a guide needs exactly one hero scene (found ${heroes.length})`
    );
  } else if (!heroes[0].screenshot) {
    problems.push('the hero scene needs screenshot: true, it is the hero still');
  }
  if (ranges.length > 1) {
    problems.push(`a guide shows the range once (found ${ranges.length})`);
  }
  if (steps.length === 0) {
    problems.push('a guide needs at least one numbered step scene');
  }
  if (steps.length > MAX_GUIDE_STEPS) {
    problems.push(
      `a guide has ${MAX_GUIDE_STEPS} steps at most (found ${steps.length}); move the rest to extras or cut them`
    );
  }
  if (extras.length > MAX_GUIDE_EXTRAS) {
    problems.push(
      `a guide has ${MAX_GUIDE_EXTRAS} extras at most (found ${extras.length})`
    );
  }
  for (const scene of [...steps, ...extras]) {
    if (!scene.guide?.heading || !scene.guide?.body) {
      problems.push(
        `scene "${scene.id}" needs a guide heading and a line or two of body`
      );
    }
  }
  for (const scene of ranges) {
    if (!scene.guide?.heading) {
      problems.push(`scene "${scene.id}" needs a guide heading`);
    }
  }

  if (guide) {
    if (guide.will.length === 0) {
      problems.push('a guide needs at least one "What it will do" line');
    }
    if (guide.wont.length === 0) {
      problems.push(
        'a guide needs at least one "What it won’t do" line, led by student safety and data'
      );
    }
    if (!guide.footerNote) {
      problems.push(
        'a guide needs its footer note saying the media uses demo classes'
      );
    }
  }

  return problems;
}

/**
 * Words the guide review cut every time. Kept short and specific: each one
 * reads as an ad, and none says what the feature does.
 */
const FILLER_WORDS = [
  'seamless',
  'seamlessly',
  'effortless',
  'effortlessly',
  'unlock',
  'unlocks',
  'empower',
  'empowers',
  'leverage',
  'leverages',
  'supercharge',
  'supercharges',
  'game-changer',
  'game-changing',
  'revolutionize',
  'revolutionizes',
  'revolutionary',
  'cutting-edge',
  'delve',
  'harness',
  'elevate',
  'elevates',
  'streamline',
  'streamlines',
  'magic',
  'magical',
];

const FILLER_PATTERN = new RegExp(`\\b(${FILLER_WORDS.join('|')})\\b`, 'gi');

/** Copy problems in one line of guide text, each phrased as the fix. */
export function lintGuideCopy(text: string): string[] {
  const problems: string[] = [];
  if (/[—–]|\s--\s/.test(text)) {
    problems.push('cut the em-dash aside; use a period or a comma');
  }
  if (/\bnot\b[^.!?]{1,60},\s*but\b/i.test(text) || /\bnot just\b/i.test(text)) {
    problems.push('say what it is; drop the "not X, but Y" construction');
  }
  const filler = [...text.matchAll(FILLER_PATTERN)].map((match) => match[1]);
  if (filler.length > 0) {
    problems.push(
      `cut ${filler.map((word) => `"${word}"`).join(' and ')}; say what it does in plain words instead`
    );
  }
  // "A, B and C": a list with a comma before its last item missing.
  if (/\w[^,.;:!?]*,\s+[^,.;:!?]+?\s(and|or)\s+\w/.test(text)) {
    problems.push(
      'use the Oxford comma: "A, B, and C", not "A, B and C"'
    );
  }
  for (const match of text.matchAll(/\byawp\b(!?)/gi)) {
    if (match[0] !== 'YAWP!') {
      problems.push('write the product name as YAWP!, capitals and the !');
      break;
    }
  }
  return problems;
}

/** Every copy problem in a guide storyboard, prefixed with the field it is in. */
export function lintGuideStoryboard(storyboard: MarketingStoryboard): string[] {
  const fields: [string, string][] = [];
  const guide = storyboard.guide;
  if (guide) {
    fields.push(['guide.headline', guide.headline]);
    fields.push(['guide.lede', guide.lede]);
    if (guide.workflowHeading) {
      fields.push(['guide.workflowHeading', guide.workflowHeading]);
    }
    guide.canDo.forEach((line, i) => fields.push([`guide.canDo.${i}`, line]));
    guide.useCases.forEach((line, i) =>
      fields.push([`guide.useCases.${i}`, line])
    );
    guide.will.forEach((line, i) => fields.push([`guide.will.${i}`, line]));
    guide.wont.forEach((line, i) => fields.push([`guide.wont.${i}`, line]));
    if (guide.footerNote) fields.push(['guide.footerNote', guide.footerNote]);
    if (guide.startLabel) fields.push(['guide.startLabel', guide.startLabel]);
  }
  for (const scene of storyboard.scenes) {
    if (scene.guide?.heading) {
      fields.push([`scenes.${scene.id}.heading`, scene.guide.heading]);
    }
    if (scene.guide?.body) {
      fields.push([`scenes.${scene.id}.body`, scene.guide.body]);
    }
  }

  return fields.flatMap(([field, text]) =>
    lintGuideCopy(text).map((problem) => `${field}: ${problem}`)
  );
}

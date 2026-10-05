import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Registered before anything imports Radix: its layout effects are chosen
// once, at import, by whether a DOM exists, and the dialog test in this
// folder needs the browser ones.
try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { getParagraphGuide } from '~/domain/assignment-types/daily-pages-paragraph-guides';

import {
  ParagraphTypeGuide,
  ParagraphTypeGuideButton,
  ParagraphTypeGuides,
} from './paragraph-type-guide';

/** The rendered text, with tags stripped and entities decoded. */
function textOf(html: string) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

describe('ParagraphTypeGuide', () => {
  const guide = getParagraphGuide('analyze')!;
  const html = renderToStaticMarkup(
    <ParagraphTypeGuide paragraphMode="analyze" />
  );
  const text = textOf(html);

  test('explains the parts, the model, the miss and the tutor questions', () => {
    for (const part of guide.parts) expect(text).toContain(part.explanation);
    expect(text).toContain(guide.oftenSkipped);
    expect(text).toContain(guide.model.text);
    expect(text).toContain(guide.miss.text);
    expect(text).toContain(guide.miss.fix);
    for (const question of guide.tutorAsks) expect(text).toContain(question);
  });

  /** The parts are marked in the model so a student can see where each one is. */
  test('marks each part inside the model paragraph', () => {
    for (const mark of guide.model.marks) {
      expect(html).toMatch(new RegExp(`<mark[^>]*data-part="${mark.part}"`));
    }
  });

  test('renders nothing for no type', () => {
    expect(
      renderToStaticMarkup(<ParagraphTypeGuide paragraphMode={null} />)
    ).toBe('');
  });
});

describe('ParagraphTypeGuideButton', () => {
  test('offers the guide on an assignment with a paragraph type', () => {
    const html = renderToStaticMarkup(
      <ParagraphTypeGuideButton paragraphMode="argue" />
    );
    expect(html).toContain('What you’re aiming for');
  });

  test('is absent when the assignment has no paragraph type', () => {
    expect(
      renderToStaticMarkup(<ParagraphTypeGuideButton paragraphMode={null} />)
    ).toBe('');
  });
});

describe('ParagraphTypeGuides', () => {
  test('lists every switched-on type for the Daily Pages page', () => {
    const html = renderToStaticMarkup(<ParagraphTypeGuides />);
    expect(html).toContain('The kinds of paragraphs');
    expect(html).toContain('Analyze');
    expect(html).toContain('Argue a position');
  });
});

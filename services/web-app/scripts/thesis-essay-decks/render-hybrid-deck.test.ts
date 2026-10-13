import { describe, expect, it } from 'bun:test';
import JSZip from 'jszip';
import type { HybridSlide } from './deck-types';
import { DECKS } from './decks';
import { ICONS } from './hybrid-theme';
import { ASSET_SIZES, parseMarks, plain, readAsset, renderHybridDeck } from './render-hybrid-deck';
import { REVIEW_QUESTIONS, reviewQuiz } from './shared-slides';

/** The slide and notes parts inside a written .pptx, by name. */
async function pptxParts(bytes: Uint8Array): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(bytes);
  const parts = new Map<string, string>();
  for (const name of Object.keys(zip.files)) {
    if (/^ppt\/(slides|notesSlides)\/[A-Za-z]+\d+\.xml$/.test(name)) {
      parts.set(name, await zip.file(name)!.async('string'));
    }
  }
  return parts;
}

/** How many slides each of Brian's original decks had. The hybrids keep them all. */
const BRIAN_SLIDE_COUNTS: Record<string, number> = {
  'lesson-1-day-1': 13,
  'lesson-2-pre-writing': 23,
  'lesson-3-thesis-statement': 44,
  'lesson-4-introduction': 23,
  'lesson-5-body-paragraphs': 24,
  'lesson-6-conclusion': 27,
  'lesson-7-titles': 20,
};

/** Slides the hybrid adds on top of Brian's (new app screenshots). */
const ADDED_SLIDES: Record<string, number> = {
  // Brian's sign-up screenshot became three slides of today's join flow.
  'lesson-1-day-1': 2,
  'lesson-3-thesis-statement': 1,
  'lesson-4-introduction': 1,
  'lesson-5-body-paragraphs': 1,
  'lesson-6-conclusion': 1,
  'lesson-7-titles': 1,
};

function strings(slide: HybridSlide): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(slide);
  return out;
}

describe('parseMarks', () => {
  it('splits highlighter, accent-bold and italic marks from plain text', () => {
    expect(parseMarks('I love it. **Why?** Because ==it is great==, __really__.')).toEqual([
      { text: 'I love it. ' },
      { text: 'Why?', strong: true },
      { text: ' Because ' },
      { text: 'it is great', highlight: true },
      { text: ', ' },
      { text: 'really', italic: true },
      { text: '.' },
    ]);
  });

  it('leaves unmarked text alone', () => {
    expect(parseMarks('Just words')).toEqual([{ text: 'Just words' }]);
    expect(plain('a ==b== **c** __d__')).toBe('a b c d');
  });
});

describe('reviewQuiz', () => {
  it('writes a question and a reveal for each of the first n questions', () => {
    const slides = reviewQuiz(3);
    expect(slides).toHaveLength(6);
    expect(slides.map((slide) => slide.layout === 'quiz' && slide.answer)).toEqual([
      undefined,
      REVIEW_QUESTIONS[0].answer,
      undefined,
      REVIEW_QUESTIONS[1].answer,
      undefined,
      REVIEW_QUESTIONS[2].answer,
    ]);
  });

  it('only reveals answers that exist', () => {
    for (const q of REVIEW_QUESTIONS) expect(q.options[q.answer]).toBeDefined();
  });
});

describe('assets', () => {
  it('has every image and icon the renderer can ask for', () => {
    for (const name of Object.keys(ASSET_SIZES)) expect(readAsset(name).length).toBeGreaterThan(0);
    for (const icon of ICONS) expect(readAsset(`icons/${icon}.png`).length).toBeGreaterThan(0);
  });
});

for (const { file, deck } of DECKS) {
  describe(file, () => {
    it('keeps every one of Brian’s slides', () => {
      expect(deck.slides).toHaveLength(BRIAN_SLIDE_COUNTS[file] + (ADDED_SLIDES[file] ?? 0));
    });

    it('gives every slide speaker notes', () => {
      for (const slide of deck.slides) expect(slide.notes.trim().length).toBeGreaterThan(20);
    });

    it('spells YAWP! with its exclamation point', () => {
      expect(JSON.stringify(deck).match(/YAWP(?!!)/g) ?? []).toEqual([]);
    });

    it('leaves no unmatched marks behind', () => {
      for (const slide of deck.slides) {
        for (const value of strings(slide)) {
          for (const mark of ['==', '**', '__']) expect(plain(value)).not.toContain(mark);
        }
      }
    });

    it('only colours thesis parts that are in the thesis', () => {
      for (const slide of deck.slides) {
        if (slide.layout !== 'thesis-parts') continue;
        for (const part of slide.parts) expect(slide.thesis).toContain(part.span);
      }
    });

    it('writes a PowerPoint with one slide and one notes page per spec', async () => {
      const parts = await pptxParts(await renderHybridDeck(deck));
      const names = [...parts.keys()];
      const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
      const notes = names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
      expect(slides).toHaveLength(deck.slides.length);
      expect(notes).toHaveLength(deck.slides.length);
    });

    // PowerPoint repairs a paragraph with more than one <a:pPr> (pptxgenjs
    // writes one before every run), and the repair scrambles its formatting:
    // highlights and bold land on the wrong words. Google Slides and
    // LibreOffice let it pass, which is why only PowerPoint looked wrong.
    it('gives each paragraph at most one pPr, ahead of its runs', async () => {
      for (const [name, xml] of await pptxParts(await renderHybridDeck(deck))) {
        for (const paragraph of xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []) {
          const count = paragraph.match(/<a:pPr[\s>\/]/g)?.length ?? 0;
          expect({ name, count }).toEqual({ name, count: Math.min(count, 1) });
          if (count === 1) expect(paragraph.startsWith('<a:p><a:pPr')).toBe(true);
        }
      }
    });

    it('keeps local file paths out of image descriptions', async () => {
      for (const xml of (await pptxParts(await renderHybridDeck(deck))).values()) {
        expect(xml).not.toMatch(/descr="[^"]*\//);
      }
    });
  });
}

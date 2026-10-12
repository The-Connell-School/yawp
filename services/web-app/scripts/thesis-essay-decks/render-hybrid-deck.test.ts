import { describe, expect, it } from 'bun:test';
import JSZip from 'jszip';
import { ICONS } from './hybrid-theme';
import { PREWRITING_DECK } from './prewriting-deck';
import { ASSET_SIZES, parseMarks, plain, readAsset, renderHybridDeck } from './render-hybrid-deck';

describe('parseMarks', () => {
  it('splits highlighter and accent-bold marks from plain text', () => {
    expect(parseMarks('I love it. **Why?** Because ==it is great==.')).toEqual([
      { text: 'I love it. ' },
      { text: 'Why?', strong: true },
      { text: ' Because ' },
      { text: 'it is great', highlight: true },
      { text: '.' },
    ]);
  });

  it('leaves unmarked text alone', () => {
    expect(parseMarks('Just words')).toEqual([{ text: 'Just words' }]);
    expect(plain('a ==b== **c**')).toBe('a b c');
  });
});

describe('PREWRITING_DECK', () => {
  const slides = PREWRITING_DECK.slides;

  it('keeps every one of Brian’s 23 slides', () => {
    expect(slides).toHaveLength(23);
  });

  it('gives every slide speaker notes', () => {
    for (const slide of slides) expect(slide.notes.trim().length).toBeGreaterThan(20);
  });

  it('spells YAWP! with its exclamation point', () => {
    const text = JSON.stringify(PREWRITING_DECK);
    expect(text.match(/YAWP(?!!)/g) ?? []).toEqual([]);
  });

  it('leaves no unmatched marks behind', () => {
    for (const slide of slides) {
      for (const value of Object.values(slide)) {
        if (typeof value !== 'string') continue;
        expect(plain(value)).not.toContain('==');
        expect(plain(value)).not.toContain('**');
      }
    }
  });

  it('only uses images and icons that exist', () => {
    for (const name of Object.keys(ASSET_SIZES)) expect(readAsset(name).length).toBeGreaterThan(0);
    for (const icon of ICONS) expect(readAsset(`icons/${icon}.png`).length).toBeGreaterThan(0);
  });
});

describe('renderHybridDeck', () => {
  it('writes a PowerPoint with one slide and one notes page per spec', async () => {
    const zip = await JSZip.loadAsync(await renderHybridDeck(PREWRITING_DECK));
    const names = Object.keys(zip.files);
    const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const notes = names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(23);
    expect(notes).toHaveLength(23);
    const second = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(second).toContain('What are we doing here?');
    // The highlighter survives into PowerPoint.
    expect(second).toContain('<a:highlight>');
  });
});

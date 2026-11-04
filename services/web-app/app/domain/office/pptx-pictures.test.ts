import { describe, expect, test } from 'bun:test';
import { readFixture } from './fixtures';
import { deckTextWithPictures, readPptxDeck } from './pptx-pictures';

describe('readPptxDeck', () => {
  const deck = readPptxDeck(readFixture('deck-pictures.pptx'));

  test('numbers pictures in the order the teacher meets them, once each', () => {
    // Presentation order is slide2.xml, slide1.xml, slide3.xml. The elephant
    // photo is on the first two; it is one picture, not two.
    expect(deck.pictures.map((picture) => [picture.position, picture.slideNumbers])).toEqual([
      [1, [1, 2]],
      [2, [1]],
      [3, [1]],
      [4, [2]],
      [5, [3]],
      [6, [3]],
    ]);
  });

  test('keeps the alt text the teacher wrote, decoded', () => {
    expect(deck.pictures[0]!.altText).toBe('An elephant in a city street & its crowd');
    // Inside a group, the picture's own description, not the group's name.
    expect(deck.pictures[3]!.altText).toBe('A map of North Bengal');
    // A shape filled with a picture carries its description too.
    expect(deck.pictures[5]!.altText).toBe('A green square');
  });

  test('keeps the bytes and size of pictures a browser can show', () => {
    const photo = deck.pictures[0]!;
    expect(photo.contentType).toBe('image/png');
    expect(photo.skipped).toBeNull();
    expect(photo.bytes?.byteLength).toBeGreaterThan(0);
    expect([photo.width, photo.height]).toEqual([40, 30]);
    const map = deck.pictures[3]!;
    expect(map.contentType).toBe('image/jpeg');
    expect([map.width, map.height]).toEqual([64, 48]);
  });

  test('names a picture it cannot show, and keeps no bytes for it', () => {
    const diagram = deck.pictures[1]!;
    expect(diagram.skipped).toBe('format');
    expect(diagram.format).toBe('EMF');
    expect(diagram.bytes).toBeNull();
    expect(diagram.altText).toBe('A funnel diagram');
  });

  test('a picture linked from the web is noted but not fetched', () => {
    const linked = deck.pictures[2]!;
    expect(linked.skipped).toBe('linked');
    expect(linked.bytes).toBeNull();
  });

  test('marks a slide background as one', () => {
    expect(deck.pictures[4]!.background).toBe(true);
    expect(deck.pictures[5]!.background).toBe(false);
  });

  test('never takes the layout’s own decoration as the teacher’s picture', () => {
    expect(deck.pictures.some((picture) => picture.altText === 'School logo')).toBe(false);
  });

  test('lists each slide’s pictures with its text', () => {
    expect(deck.slides.map((slide) => slide.pictures)).toEqual([[1, 2, 3], [1, 4], [5, 6]]);
    expect(deck.slides[0]!.lines).toEqual(['Observe and analyze']);
  });

  test('stops keeping bytes past the picture cap', () => {
    const capped = readPptxDeck(readFixture('deck-pictures.pptx'), { maxPictures: 1 });
    expect(capped.pictures.filter((picture) => picture.bytes).map((picture) => picture.position)).toEqual([1]);
    expect(capped.pictures[3]!.skipped).toBe('count');
  });

  test('drops a picture over the size cap', () => {
    const capped = readPptxDeck(readFixture('deck-pictures.pptx'), { maxPictureBytes: 10 });
    expect(capped.pictures[0]!.skipped).toBe('size');
    expect(capped.pictures[0]!.bytes).toBeNull();
  });
});

describe('deckTextWithPictures', () => {
  const deck = readPptxDeck(readFixture('deck-pictures.pptx'));
  const text = deckTextWithPictures(deck);

  test('numbers the slides so the planner can point at one', () => {
    expect(text).toContain('Slide 1\nObserve and analyze');
    expect(text).toContain('Slide 3\nYour turn');
  });

  test('says where each picture sits and what it shows', () => {
    expect(text).toContain('[Picture 1: An elephant in a city street & its crowd]');
    expect(text).toContain('[Picture 2, an EMF Yawp! cannot show: A funnel diagram]');
    expect(text).toContain('[Picture 3, linked from the web and not in the file: From the web]');
    expect(text).toContain('[Picture 5, the slide background: no description]');
  });
});

describe('alt text that is not a description', () => {
  test('a file name or PowerPoint’s boilerplate is not taken as one', async () => {
    const { cleanAltText } = await import('./pptx-pictures');
    expect(cleanAltText('img/swatch.jpg')).toBe('');
    expect(cleanAltText('A dog on a beach\n\nDescription automatically generated')).toBe('A dog on a beach');
    expect(cleanAltText('  The Great Wave  ')).toBe('The Great Wave');
  });
});

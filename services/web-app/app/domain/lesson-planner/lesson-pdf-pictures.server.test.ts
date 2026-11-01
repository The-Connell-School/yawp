/**
 * The teacher's own picture in the slides PDF (Nov 1): printed on its slide
 * when this file may carry it, a placeholder that says so when it may not.
 */
import { describe, expect, test } from 'bun:test';
import { extractText, getDocumentProxy } from 'unpdf';
import { renderSlidesPdf } from './lesson-pdf.server';
import type { DeckPictureFiles } from './deck-pictures.server';
import type { SlideDeck } from './slide-deck';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DwnwEIAA/+Av7a4c0mAAAAAElFTkSuQmCC',
  'base64'
);
const DECK: SlideDeck = {
  title: 'Thesis statements',
  slides: [
    {
      layout: 'picture',
      title: 'Observe and analyze',
      question: 'What is happening in this picture?',
      image: 'cmh0elephant0000abcd',
      speakerNotes: 'Two minutes of silent looking.',
    },
  ],
};
const PICTURES: DeckPictureFiles = new Map([
  ['cmh0elephant0000abcd', { id: 'cmh0elephant0000abcd', altText: 'An elephant', width: 2, height: 1, contentType: 'image/png', data: PNG }],
]);

async function textOf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  return (await extractText(pdf, { mergePages: true })).text.replace(/\s+/g, ' ');
}
const images = (bytes: Uint8Array) => (Buffer.from(bytes).toString('latin1').match(/\/Subtype \/Image/g) ?? []).length;

describe('picture slides in the slides PDF', () => {
  test('the picture is printed on its slide, beside its question', async () => {
    const bytes = await renderSlidesPdf({ lessonTitle: 'Day 1', deck: DECK, pictures: PICTURES });
    expect(images(bytes)).toBeGreaterThan(0);
    const text = await textOf(bytes);
    expect(text).toContain('What is happening in this picture?');
    expect(text).not.toContain('not shared');
  });

  test('without the picture, a placeholder says so', async () => {
    const bytes = await renderSlidesPdf({ lessonTitle: 'Day 1', deck: DECK });
    expect(images(bytes)).toBe(0);
    expect(await textOf(bytes)).toContain('not shared');
  });
});

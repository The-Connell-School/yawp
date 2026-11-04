/**
 * The teacher's own picture in every PowerPoint the planner writes (Nov 1):
 * the plain deck, the tile deck and the gallery deck. With the picture, the
 * file carries it, with its alt text; without it (not this teacher's), the
 * slide says so instead of leaving a hole.
 */
import { describe, expect, test } from 'bun:test';
import { readZipEntries } from '~/domain/office/zip';
import { PICTURE_PLACEHOLDER } from './deck-pictures';
import type { DeckPictureFiles } from './deck-pictures.server';
import { renderDeckPptx } from './lesson-pptx.server';
import { renderDeckPptxTile } from './lesson-pptx-tile.server';
import { renderDeckPptxGallery } from './lesson-pptx-gallery.server';
import type { SlideDeck } from './slide-deck';

// A 2×1 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DwnwEIAA/+Av7a4c0mAAAAAElFTkSuQmCC',
  'base64'
);

const DECK: SlideDeck = {
  title: 'Develop your thesis statement',
  slides: [
    { layout: 'title', title: 'Develop your thesis statement', speakerNotes: 'Welcome.' },
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
  [
    'cmh0elephant0000abcd',
    { id: 'cmh0elephant0000abcd', altText: 'An elephant in a city street', width: 2, height: 1, contentType: 'image/png', data: PNG },
  ],
]);

const RENDERERS = [
  ['plain', renderDeckPptx],
  ['tile', renderDeckPptxTile],
  ['gallery', renderDeckPptxGallery],
] as const;

function parts(bytes: Uint8Array) {
  const entries = readZipEntries(bytes);
  const text = (name: string) => entries.get(name)?.read().toString('utf8') ?? '';
  return { names: [...entries.keys()], text };
}

describe('picture slides in PowerPoint', () => {
  for (const [name, render] of RENDERERS) {
    test(`${name}: the file carries the teacher’s picture, with its alt text and its words`, async () => {
      const file = parts(await render(DECK, { pictures: PICTURES }));
      expect(file.names.filter((part) => part.startsWith('ppt/media/')).length).toBeGreaterThan(0);
      const slide = file.text('ppt/slides/slide2.xml');
      expect(slide).toContain('<p:pic>');
      expect(slide).toContain('descr="An elephant in a city street"');
      expect(slide).toContain('What is happening in this picture?');
      expect(slide).not.toContain(PICTURE_PLACEHOLDER);
    });

    test(`${name}: a picture it may not have becomes the placeholder`, async () => {
      const file = parts(await render(DECK));
      const slide = file.text('ppt/slides/slide2.xml');
      expect(slide).not.toContain('descr="An elephant in a city street"');
      expect(slide).toContain(PICTURE_PLACEHOLDER.replace('’', '’'));
      expect(slide).toContain('What is happening in this picture?');
    });
  }
});

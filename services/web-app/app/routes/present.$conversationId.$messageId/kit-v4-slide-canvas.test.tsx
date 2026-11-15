import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GallerySlideCanvas, GallerySlideThumbnail } from './gallery-slide-canvas';
import { KitV4SlideCanvas } from './kit-v4-slide-canvas';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';

const deck: SlideDeck = {
  title: 'Body Paragraphs',
  art: 'hokusai-great-wave',
  slides: [
    { layout: 'title', title: 'Body Paragraphs', subtitle: 'Build on your thesis', speakerNotes: 'Open.' },
    { layout: 'steps', title: 'Draft your topic sentence', bullets: ['Reread your thesis', 'Pick one reason'], minutes: 6, speakerNotes: 'Go.' },
    { layout: 'write', title: 'Quick write', body: 'What does your first reason prove?', minutes: 5, speakerNotes: 'Write.' },
  ],
};

describe('KitV4SlideCanvas', () => {
  test('draws the slide on cream, its words in Georgia and Arial, never italic', () => {
    const html = renderToStaticMarkup(<KitV4SlideCanvas deck={deck} index={2} />);
    expect(html).toContain('data-theme="kit-v4"');
    expect(html).toContain('background:#F3F0E8');
    expect(html).toContain('What does your first reason prove?');
    expect(html).not.toContain('italic');
    expect(html).toContain('Georgia');
    expect(html).toContain('Arial');
  });

  test('a split slide draws its panel and its label in gold', () => {
    const html = renderToStaticMarkup(<KitV4SlideCanvas deck={deck} index={1} />);
    expect(html).toContain('data-kit-role="panel"');
    expect(html).toMatch(/color:#E8C062[^>]*>Do</);
  });

  test('the painting hangs plain, credited, with its alt text', () => {
    const html = renderToStaticMarkup(<KitV4SlideCanvas deck={deck} index={0} />);
    expect(html).toContain('data-testid="gallery-credit"');
    expect(html).toContain('alt="Under the Wave off Kanagawa (The Great Wave), Katsushika Hokusai"');
    expect(html).toContain('object-fit:contain');
  });
});

describe('GallerySlideCanvas picks the kit from the deck', () => {
  test('a deck marked v4 is drawn in v4, everywhere the gallery canvas is used', () => {
    const html = renderToStaticMarkup(<GallerySlideCanvas deck={{ ...deck, kit: 'v4' }} index={2} />);
    expect(html).toContain('data-theme="kit-v4"');
    const thumb = renderToStaticMarkup(<GallerySlideThumbnail deck={{ ...deck, kit: 'v4' }} index={1} width={240} />);
    expect(thumb).toContain('data-theme="kit-v4"');
  });

  test('an unmarked deck is drawn in spec v3, as before', () => {
    const html = renderToStaticMarkup(<GallerySlideCanvas deck={deck} index={2} />);
    expect(html).toContain('data-theme="gallery"');
    expect(html).not.toContain('kit-v4');
  });
});

describe('KitV4SlideCanvas (spec v4.1)', () => {
  const v41: SlideDeck = { ...deck, kit: 'v4.1' };

  test('headlines in Fraunces Bold, with Georgia and Arial for the rest, never italic', () => {
    const title = renderToStaticMarkup(<KitV4SlideCanvas deck={v41} index={0} />);
    expect(title).toMatch(/font-family:Fraunces[^"]*font-weight:700[^>]*>(?:<[^>]+>)*Body Paragraphs/);
    expect(title).toContain('data-theme="kit-v4"');
    expect(title).toContain('data-kit="v4.1"');
    const write = renderToStaticMarkup(<KitV4SlideCanvas deck={v41} index={2} />);
    expect(write).toMatch(/font-family:Fraunces/);
    expect(write).toContain('Arial');
    expect(write).not.toContain('italic');
  });

  test('no running head', () => {
    for (const index of [1, 2]) {
      expect(renderToStaticMarkup(<KitV4SlideCanvas deck={v41} index={index} />)).not.toContain('gallery-running-head');
    }
    // Spec v4 keeps it, and has no Fraunces.
    const v4 = renderToStaticMarkup(<KitV4SlideCanvas deck={{ ...deck, kit: 'v4' }} index={1} />);
    expect(v4).toContain('gallery-running-head');
    expect(v4).not.toContain('Fraunces');
    expect(v4).toContain('data-kit="v4"');
  });

  test('the gallery canvas hands a v4.1 deck to the kit canvas', () => {
    const html = renderToStaticMarkup(<GallerySlideCanvas deck={v41} index={0} />);
    expect(html).toContain('data-kit="v4.1"');
  });
});

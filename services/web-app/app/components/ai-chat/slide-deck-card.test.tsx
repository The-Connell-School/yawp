import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SlideDeckCard } from './slide-deck-card';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';

const deckWithArt: SlideDeck = {
  title: 'Weight',
  art: 'turner-temeraire',
  slides: [
    { layout: 'title', title: 'Weight', speakerNotes: 'Open.', minutes: 1 },
    { layout: 'prompt', title: 'Write', body: 'What do you carry?', speakerNotes: 'Write.', minutes: 5 },
  ],
};

describe('SlideDeckCard — gallery preview uses the deck art registry', () => {
  test('gallery mode renders slide thumbnails instead of text stubs', () => {
    const html = renderToStaticMarkup(
      <SlideDeckCard deck={deckWithArt} presentHref={null} deckGallery />
    );
    expect(html).toContain('data-template="title"');
    expect(html).not.toContain('Write</p>');
  });

  test('tile mode keeps text stub thumbnails', () => {
    const html = renderToStaticMarkup(
      <SlideDeckCard deck={deckWithArt} presentHref={null} deckGallery={false} />
    );
    expect(html).toContain('Write');
    expect(html).not.toContain('data-template="title"');
  });
});

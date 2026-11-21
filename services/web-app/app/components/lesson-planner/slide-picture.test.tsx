/**
 * A found picture's credit on every screen (Nov 21, phase 2): Present, Run the
 * show, the studio and the chat's preview all draw pictures through here.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeckPicturesProvider, SlidePicture } from './slide-picture';

const html = (credit: string | null) =>
  renderToStaticMarkup(
    <DeckPicturesProvider pictures={{ pic1aaaaaaaa: { id: 'pic1aaaaaaaa', altText: 'Garibaldi', width: 4, height: 3, credit } }}>
      <SlidePicture id="pic1aaaaaaaa" />
    </DeckPicturesProvider>
  );

describe('SlidePicture', () => {
  test('a found picture shows its credit over its foot', () => {
    const out = html('Mathew Brady, Garibaldi, Public domain, via Wikimedia Commons');
    expect(out).toContain('data-testid="slide-picture-credit"');
    expect(out).toContain('Mathew Brady, Garibaldi, Public domain, via Wikimedia Commons');
  });

  test('the teacher’s own picture has no credit line', () => {
    expect(html(null)).not.toContain('slide-picture-credit');
  });
});

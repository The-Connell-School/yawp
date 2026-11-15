import { describe, expect, it } from 'bun:test';
import JSZip from 'jszip';
import type { SceneElement } from '../../app/domain/thesis-essay-decks/deck-scene';
import { DECKS } from './decks';
import { plain, readAsset, renderDeckScene, renderHybridDeck } from './render-hybrid-deck';

/** Shapes, text boxes and pictures on each slide of a written .pptx, in order. */
async function pptxObjectCounts(bytes: Uint8Array): Promise<number[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  const counts: number[] = [];
  for (const name of names) {
    const xml = await zip.file(name)!.async('string');
    counts.push((xml.match(/<p:sp>|<p:pic>/g) ?? []).length);
  }
  return counts;
}

function textOf(element: SceneElement): string {
  return element.kind === 'text'
    ? element.paragraphs.map((p) => p.runs.map((run) => run.text).join('')).join('\n')
    : '';
}

for (const { file, deck } of DECKS) {
  describe(`${file} scene`, () => {
    const scene = renderDeckScene(deck);

    it('has one scene slide per deck slide, with its notes', () => {
      expect(scene.slides).toHaveLength(deck.slides.length);
      scene.slides.forEach((slide, index) => expect(slide.notes).toBe(deck.slides[index].notes));
    });

    // The web scene and the .pptx are drawn by the same layout code, so they
    // must hold the same shapes, text boxes and pictures, slide for slide.
    it('draws the same objects as the PowerPoint, slide for slide', async () => {
      const counts = await pptxObjectCounts(await renderHybridDeck(deck));
      // The .pptx keeps the wordmark on its master but writes the slide
      // number onto every slide: one object more than the scene's own.
      expect(scene.slides.map((slide) => slide.elements.filter((e) => !e.master).length + 1)).toEqual(counts);
    });

    it('carries each slide’s title text', () => {
      scene.slides.forEach((slide, index) => {
        const spec = deck.slides[index];
        if (!('title' in spec) || typeof spec.title !== 'string') return;
        const words = slide.elements.map(textOf).join('\n').replace(/ /g, ' ');
        expect(words).toContain(plain(spec.title));
      });
    });

    it('points only at images that exist, with alt text', () => {
      for (const slide of scene.slides) {
        for (const element of slide.elements) {
          if (element.kind !== 'image') continue;
          expect(readAsset(element.asset).length).toBeGreaterThan(0);
          expect(element.alt.length).toBeGreaterThan(0);
          expect(element.asset).not.toContain('..');
        }
      }
    });

    it('stamps the YAWP! wordmark and slide number on every slide', () => {
      scene.slides.forEach((slide, index) => {
        const master = slide.elements.filter((e) => e.master).map(textOf);
        expect(master).toEqual(['YAWP!', String(index + 1)]);
      });
    });
  });
}

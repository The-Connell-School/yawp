/**
 * A gallery deck in the Lesson Deck Kit, spec v4, as PowerPoint ("Building
 * for Google Slides and PowerPoint"): the slide's v4 layout
 * (`layoutKitV4Slide`) on a 13.333 × 7.5 in canvas, where a kit pixel is
 * 0.01042 in and a point is px × 0.75.
 *
 * Rectangles only (the panels and answer bands), no shadows, gradients,
 * transparency or rules. Georgia and Arial only, as the theme fonts too.
 * Every word is a real text box in reading order, and a column's label,
 * headline and body share one box so they push each other down.
 */
import PptxGenJS from 'pptxgenjs';
import { addPptxPicture, type DeckPictureFiles } from './deck-pictures.server';
import { KIT_V4, layoutKitV4Slide, type KitV4Element } from './deck-kit-v4';
import type { SlideDeck } from './slide-deck';
import { notesWithMinutes } from './tile-theme';
import { galleryImageData } from './lesson-pptx-gallery.server';

const LAYOUT = { name: 'YAWP_KIT_V4_16x9', width: 13.333, height: 7.5 };
const SERIF = 'Georgia';
const SANS = 'Arial';
const hex = (color: string) => color.replace('#', '').toUpperCase();
/** A kit pixel in inches. */
const px = (value: number) => (value * LAYOUT.width) / 1280;
/** A kit pixel size in points. */
const pt = (value: number) => Math.round(value * 0.75 * 10) / 10;

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;

function drawElement(
  slide: PptxSlide,
  element: KitV4Element,
  image: (src: string) => string | null,
  pictures: DeckPictureFiles
): void {
  const box = { x: px(element.x), y: px(element.y), w: px(element.w), h: px(element.h) };
  switch (element.kind) {
    case 'rect':
      slide.addShape('rect', { ...box, fill: { color: hex(element.fill) }, line: { color: hex(element.fill), width: 0 } });
      return;
    case 'art': {
      const data = image(element.src);
      if (!data) return;
      slide.addImage({
        data,
        ...box,
        sizing: { type: element.fit, w: box.w, h: box.h },
        altText: element.alt || undefined,
      });
      return;
    }
    case 'picture':
      addPptxPicture(slide as never, pictures.get(element.id), box, { rule: hex(KIT_V4.grey), muted: hex(KIT_V4.grey), fontFace: SANS });
      return;
    case 'text': {
      const runs: PptxGenJS.TextProps[] = [];
      element.paras.forEach((para, p) => {
        const largest = Math.max(...para.runs.map((run) => run.size));
        para.runs.forEach((run, r) => {
          const last = r === para.runs.length - 1;
          runs.push({
            text: run.text,
            options: {
              fontFace: run.face === 'serif' ? SERIF : SANS,
              fontSize: pt(run.size),
              color: hex(run.color),
              // Georgia is never bold, and nothing is italic.
              bold: run.face === 'sans' && Boolean(run.bold),
              italic: false,
              ...(last && p < element.paras.length - 1 ? { breakLine: true } : {}),
              ...(last ? { paraSpaceAfter: pt(para.after ?? 0) } : {}),
              lineSpacing: pt(largest * (para.leading ?? (largest >= 44 ? 1.1 : 1.35))),
            },
          });
        });
      });
      if (!runs.length) return;
      slide.addText(runs, {
        ...box,
        margin: 0,
        valign: element.valign === 'middle' ? 'middle' : element.valign,
        align: element.align ?? 'left',
        fit: 'shrink',
      });
      return;
    }
  }
}

export async function renderDeckPptxKitV4(
  deck: SlideDeck,
  { pictures = new Map() }: { pictures?: DeckPictureFiles } = {}
): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout(LAYOUT);
  pptx.layout = LAYOUT.name;
  pptx.theme = { headFontFace: SERIF, bodyFontFace: SANS };
  pptx.title = deck.title;
  if (deck.subtitle) pptx.subject = deck.subtitle;
  pptx.company = 'Yawp!';

  const cache = new Map<string, string | null>();
  const image = (src: string) => {
    if (!cache.has(src)) cache.set(src, galleryImageData(src));
    return cache.get(src)!;
  };
  deck.slides.forEach((spec, index) => {
    const layout = layoutKitV4Slide(deck, index);
    const slide = pptx.addSlide();
    slide.background = { color: hex(layout.background) };
    for (const element of layout.elements) drawElement(slide, element, image, pictures);
    slide.addNotes(notesWithMinutes(spec.speakerNotes, spec.minutes));
  });

  const written = await pptx.write({ outputType: 'nodebuffer' });
  return new Uint8Array(written as Buffer);
}

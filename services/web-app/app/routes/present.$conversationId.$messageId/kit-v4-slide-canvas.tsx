/**
 * A gallery slide in the Yawp! Lesson Deck Kit, spec v4.1, drawn from its
 * layout (`layoutKitV4Slide`) on a 1280×720 design canvas that scales with
 * its box: every size is a kit pixel, in `u` (1/1280 of the slide's width).
 * The same boxes PowerPoint and the PDF draw, so all three hang one slide.
 * Fraunces Bold comes from the @font-face in app.css.
 */
import type { CSSProperties } from 'react';
import { SlidePicture } from '~/components/lesson-planner/slide-picture';
import { BrandSafe } from '~/components/brand/brand-safe';
import {
  KIT_V4_FONTS,
  layoutKitV4Slide,
  type KitV4Element,
  type KitV4Para,
} from '~/domain/lesson-planner/deck-kit-v4';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';

/** A kit pixel, at whatever size the slide is drawn. */
const u = (px: number) => `calc(${px} * 100cqw / 1280)`;

const JUSTIFY: Record<'top' | 'middle' | 'bottom', CSSProperties['justifyContent']> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
};

function Para({ para, align }: { para: KitV4Para; align?: 'left' | 'right' }) {
  const largest = Math.max(...para.runs.map((run) => run.size));
  return (
    <p
      style={{
        margin: 0,
        marginBottom: para.after ? u(para.after) : 0,
        lineHeight: para.leading ?? (largest >= 44 ? 1.1 : 1.35),
        textAlign: align ?? 'left',
        whiteSpace: 'pre-wrap',
      }}
    >
      {para.runs.map((run, i) => (
        <span
          key={i}
          style={{
            fontFamily: KIT_V4_FONTS[run.face],
            // Fraunces is only ever Bold; Georgia never is.
            fontWeight: run.face === 'display' || (run.face === 'sans' && run.bold) ? 700 : 400,
            fontStyle: 'normal',
            fontSize: u(run.size),
            color: run.color,
            letterSpacing: run.face !== 'sans' && run.size >= 52 ? '-0.01em' : undefined,
          }}
        >
          <BrandSafe>{run.text}</BrandSafe>
        </span>
      ))}
    </p>
  );
}

function Element({ element }: { element: KitV4Element }) {
  const box: CSSProperties = { position: 'absolute', left: u(element.x), top: u(element.y), width: u(element.w), height: u(element.h) };
  switch (element.kind) {
    case 'rect':
      return <div aria-hidden data-kit-role={element.role} data-testid={element.role === 'band' ? 'gallery-answer' : undefined} style={{ ...box, background: element.fill }} />;
    case 'art':
      return (
        <img
          src={element.src}
          alt={element.alt}
          aria-hidden={element.alt ? undefined : true}
          style={{ ...box, objectFit: element.fit, objectPosition: element.fit === 'contain' ? 'left center' : 'center' }}
        />
      );
    case 'picture':
      return (
        <div style={box}>
          <SlidePicture id={element.id} tone="light" />
        </div>
      );
    case 'text':
      return (
        <div
          data-testid={element.role === 'credit' ? 'gallery-credit' : undefined}
          style={{ ...box, display: 'flex', flexDirection: 'column', justifyContent: JUSTIFY[element.valign], overflow: 'hidden' }}
        >
          {element.paras.map((para, i) => (
            <Para key={i} para={para} align={element.align} />
          ))}
        </div>
      );
  }
}

export function KitV4SlideCanvas({ deck, index }: { deck: SlideDeck; index: number }) {
  if (!deck.slides[index]) return null;
  const layout = layoutKitV4Slide(deck, index);
  return (
    <div
      className="@container relative h-full w-full overflow-hidden"
      data-layout={deck.slides[index]!.layout}
      data-template={layout.template}
      data-ground="cream"
      data-theme="kit-v4"
      style={{ background: layout.background, fontFamily: KIT_V4_FONTS.sans }}
    >
      {layout.elements.map((element, i) => (
        <Element key={i} element={element} />
      ))}
    </div>
  );
}

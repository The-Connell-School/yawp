/**
 * One Thesis-Driven Essay slide, drawn from its scene: the same boxes, text
 * and pictures as the PowerPoint, at the same positions, scaled to whatever
 * the slide is shown on.
 *
 * Everything is sized against the slide's own width (container query units),
 * so a 13.333-inch PowerPoint page maps onto any screen: an inch is 7.5cqw.
 */
import type { CSSProperties } from 'react';
import {
  SCENE_PAGE,
  type SceneElement,
  type SceneParagraph,
  type SceneShape,
  type SceneSlide,
  type SceneText,
} from '~/domain/thesis-essay-decks/deck-scene';
import { deckAssetHref } from '~/domain/thesis-essay-decks/thesis-essay-decks';

const CQW_PER_INCH = 100 / SCENE_PAGE.width;

const inches = (n: number) => `${n * CQW_PER_INCH}cqw`;
const points = (n: number) => inches(n / 72);

/**
 * The deck's faces, with stand-ins that share their metrics for screens
 * without them (Chromebooks have no Georgia or Calibri): Gelasio for
 * Georgia, Carlito for Calibri. Served from /fonts/deck (deck-fonts.css).
 */
const FONT_STACKS: Record<string, string> = {
  Georgia: "Georgia, 'YAWP Deck Serif', serif",
  Calibri: "Calibri, 'YAWP Deck Sans', sans-serif",
  Consolas: "Consolas, 'YAWP Deck Mono', monospace",
};

/** A face's single line height, in ems: what PowerPoint's line spacing multiplies. */
const LINE_EM: Record<string, number> = { Georgia: 1.136, Calibri: 1.22, Consolas: 1.17 };

function fontStack(face: string | undefined): string | undefined {
  return face ? (FONT_STACKS[face] ?? face) : undefined;
}

function hex(color: string | undefined): string | undefined {
  return color ? `#${color}` : undefined;
}

function rgba(color: string, opacity: number): string {
  const value = Number.parseInt(color, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

function placed(element: SceneElement): CSSProperties {
  return {
    position: 'absolute',
    left: `${(element.x / SCENE_PAGE.width) * 100}%`,
    top: `${(element.y / SCENE_PAGE.height) * 100}%`,
    width: `${(element.w / SCENE_PAGE.width) * 100}%`,
    height: `${(element.h / SCENE_PAGE.height) * 100}%`,
  };
}

function Shape({ shape }: { shape: SceneShape }) {
  const style: CSSProperties = {
    ...placed(shape),
    boxSizing: 'border-box',
    background: hex(shape.fill),
    borderRadius: shape.shape === 'ellipse' ? '50%' : shape.radius ? inches(shape.radius) : undefined,
    border: shape.line ? `${points(shape.line.width)} solid ${hex(shape.line.color)}` : undefined,
    boxShadow: shape.shadow
      ? `0 ${points(shape.shadow.offset)} ${points(shape.shadow.blur)} ${rgba(shape.shadow.color, shape.shadow.opacity)}`
      : undefined,
  };
  return <div aria-hidden style={style} />;
}

function Paragraph({ paragraph }: { paragraph: SceneParagraph }) {
  const style: CSSProperties = {
    margin: 0,
    marginBottom: paragraph.spaceAfter ? points(paragraph.spaceAfter) : 0,
    ...(paragraph.bullet ? { paddingLeft: '1em', textIndent: '-1em' } : {}),
  };
  return (
    <p style={style}>
      {paragraph.bullet ? <span aria-hidden>{'●  '}</span> : null}
      {paragraph.runs.length
        ? paragraph.runs.map((run, index) => (
            <span
              key={index}
              style={{
                fontFamily: fontStack(run.fontFace),
                fontSize: run.fontSize ? points(run.fontSize) : undefined,
                fontWeight: run.bold ? 700 : undefined,
                fontStyle: run.italic ? 'italic' : undefined,
                color: hex(run.color),
                background: hex(run.highlight),
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              }}
            >
              {run.text}
            </span>
          ))
        : // An empty paragraph still takes a line, as in PowerPoint.
          ' '}
    </p>
  );
}

function Text({ text }: { text: SceneText }) {
  const face = text.fontFace ?? 'Calibri';
  const justify = text.valign === 'middle' ? 'center' : text.valign === 'bottom' ? 'flex-end' : 'flex-start';
  const style: CSSProperties = {
    ...placed(text),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: justify,
    fontFamily: fontStack(face),
    fontSize: points(text.fontSize ?? 18),
    fontWeight: text.bold ? 700 : 400,
    fontStyle: text.italic ? 'italic' : undefined,
    color: hex(text.color) ?? '#000000',
    textAlign: text.align ?? 'left',
    lineHeight: (text.lineSpacingMultiple ?? 1) * (LINE_EM[face] ?? 1.2),
    letterSpacing: text.charSpacing ? points(text.charSpacing) : undefined,
    transform: text.rotate ? `rotate(${text.rotate}deg)` : undefined,
    overflowWrap: 'break-word',
  };
  return (
    <div style={style}>
      {text.paragraphs.map((paragraph, index) => (
        <Paragraph key={index} paragraph={paragraph} />
      ))}
    </div>
  );
}

export function SceneSlideView({ slide }: { slide: SceneSlide }) {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ containerType: 'inline-size', background: hex(slide.background) }}
    >
      {slide.elements.map((element, index) => {
        if (element.kind === 'shape') return <Shape key={index} shape={element} />;
        if (element.kind === 'text') return <Text key={index} text={element} />;
        return (
          <img
            key={index}
            src={deckAssetHref(element.asset)}
            alt={element.alt}
            draggable={false}
            style={{ ...placed(element), objectFit: 'fill' }}
          />
        );
      })}
    </div>
  );
}

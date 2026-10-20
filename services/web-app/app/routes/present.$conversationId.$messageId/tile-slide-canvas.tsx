/**
 * One slide in the Yawp! tile template (Brian's review, E1), matching the
 * PowerPoint export so Present, PDF and PowerPoint agree.
 *
 * Cream page, raised white tiles with a faint orange border, a mono eyebrow
 * over a serif title, a soft orange block where a class tile has its art.
 * Brian's run 2: "subtle, subtle, subtle" — full-strength terracotta only for
 * small marks, and no minutes on the slide face (C2, C3). No artwork. Sized
 * with container units, so it reads on a laptop and from the back row alike.
 *
 * Given `onEdit`, the slide's words are editable in place (C4), and every
 * keystroke goes to the same slide the form below edits, so the two agree.
 */
import { useLayoutEffect, useRef } from 'react';
import { classicSlide, type Slide } from '~/domain/lesson-planner/slide-deck';
import {
  css,
  DEFAULT_TILE_FOOTER_MARK,
  tileEyebrow,
  type TileFooterMark,
} from '~/domain/lesson-planner/tile-theme';

const SERIF = "'Cormorant Garamond', adobe-garamond-pro, Garamond, Georgia, serif";
const TITLE_TYPE = 'clamp(1.5rem, 4.2cqw, 4.25rem)';
const BIG_TYPE = 'clamp(1.6rem, 4.8cqw, 4.75rem)';
const BODY_TYPE = 'clamp(1.1rem, 3.1cqw, 3rem)';
const LIST_TYPE = 'clamp(1rem, 2.4cqw, 2.25rem)';
const EYEBROW_TYPE = 'clamp(0.6rem, 1.1cqw, 1rem)';
const PASSAGE_TYPE = 'clamp(0.85rem, 2cqw, 1.8rem)';

/** A raised white tile with a faint orange border (C3). */
const CARD_STYLE = {
  background: css('paper'),
  border: `1px solid ${css('tileBorder')}`,
  boxShadow: '0 0.3em 0.9em rgba(60, 56, 40, 0.12)',
  borderRadius: '0.35em',
} as const;

type Edit = ((patch: Partial<Slide>) => void) | undefined;

export function TileSlideCanvas({
  slide: raw,
  number,
  onEdit,
  footerMark = DEFAULT_TILE_FOOTER_MARK,
}: {
  slide: Slide;
  /** 1-based, for the corner. */
  number?: number;
  /** The deck editor: edit the words on the slide itself. */
  onEdit?: (patch: Partial<Slide>) => void;
  footerMark?: TileFooterMark;
}) {
  // A gallery slide drawn as its nearest classic layout.
  const slide = classicSlide(raw);
  const closing = slide.layout === 'closing';
  return (
    <div
      className="@container relative h-full w-full"
      data-layout={slide.layout}
      data-theme="tile"
      style={{ background: closing ? css('accentSoft') : css('cream'), color: css('ink') }}
    >
      {slide.layout === 'title' ? (
        // Full bleed: the colour block runs edge to edge, like a tile's art.
        <div className="absolute inset-0">
          <TileBody slide={slide} onEdit={onEdit} />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col px-[5.5%] pb-[7%] pt-[4.5%]">
          <TileBody slide={slide} onEdit={onEdit} />
        </div>
      )}
      {/* The wordmark and the slide number, in place of a footer mark. */}
      {!closing && slide.layout !== 'title' && footerMark !== 'none' ? (
        <span
          data-testid="tile-footer-mark"
          className="absolute bottom-[3.5%] left-[5.5%] font-bold"
          style={{
            fontFamily: SERIF,
            fontSize: EYEBROW_TYPE,
            color: css('accent'),
            opacity: footerMark === 'faded' ? 0.18 : 1,
          }}
        >
          Yawp!
        </span>
      ) : null}
      {number ? (
        <span
          className="absolute bottom-[3.5%] right-[5.5%] font-mono tabular-nums"
          style={{ fontSize: EYEBROW_TYPE, color: closing ? css('ink') : css('muted') }}
        >
          {number}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Words on the slide. Read-only unless the editor passes `onEdit`; then it is
 * edited in place, and the DOM is left alone while the teacher types so the
 * caret never jumps.
 */
function Words({
  value,
  onChange,
  label,
  as: Tag = 'span',
  className,
  style,
}: {
  value: string;
  onChange?: (next: string) => void;
  label: string;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'blockquote';
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !onChange) return;
    if (document.activeElement !== node && node.textContent !== value) {
      node.textContent = value;
    }
  }, [value, onChange]);
  if (!onChange) {
    return (
      <Tag className={className} style={style}>
        {value}
      </Tag>
    );
  }
  return (
    <Tag
      ref={ref as never}
      role="textbox"
      aria-label={label}
      data-testid="slide-words"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={(event) => onChange((event.currentTarget as HTMLElement).textContent ?? '')}
      onKeyDown={(event) => {
        // One line per field: Enter finishes, as in the form.
        if (event.key === 'Enter') {
          event.preventDefault();
          (event.currentTarget as HTMLElement).blur();
        }
      }}
      className={`${className ?? ''} cursor-text rounded-[0.15em] outline-none ring-[#D27151]/50 hover:ring-1 focus:ring-2`}
      style={style}
    />
  );
}

function Eyebrow({ slide, light }: { slide: Slide; light?: boolean }) {
  return (
    <p
      className="font-mono tracking-[0.2em]"
      style={{ fontSize: EYEBROW_TYPE, color: light ? css('ink') : css('accent') }}
    >
      {tileEyebrow(classicSlide(slide).layout)}
    </p>
  );
}

function Heading({ slide, onEdit }: { slide: Slide; onEdit: Edit }) {
  return (
    <div className="mb-[3%]">
      <Eyebrow slide={slide} />
      <Words
        as="h2"
        label="Slide title"
        value={slide.title}
        onChange={onEdit ? (title) => onEdit({ title }) : undefined}
        className="block leading-[1.1]"
        style={{ fontFamily: SERIF, fontSize: TITLE_TYPE, color: css('ink') }}
      />
    </div>
  );
}

function TileBody({ slide, onEdit }: { slide: Slide; onEdit: Edit }) {
  const body = (className: string, style: React.CSSProperties, as: 'p' | 'blockquote' = 'p') => (
    <Words
      as={as}
      label="Slide text"
      value={slide.body ?? ''}
      onChange={onEdit ? (next) => onEdit({ body: next }) : undefined}
      className={className}
      style={style}
    />
  );

  switch (slide.layout) {
    case 'title':
      return (
        <div className="flex h-full w-full">
          <div className="w-[34%] shrink-0" style={{ background: css('accentSoft') }} aria-hidden />
          <div className="flex flex-1 flex-col justify-center gap-[0.4em] px-[6%]">
            <Eyebrow slide={slide} />
            <Words
              as="h1"
              label="Slide title"
              value={slide.title}
              onChange={onEdit ? (title) => onEdit({ title }) : undefined}
              className="block leading-[1.05]"
              style={{ fontFamily: SERIF, fontSize: BIG_TYPE, color: css('ink') }}
            />
            {slide.subtitle || onEdit ? (
              <Words
                as="p"
                label="Subtitle"
                value={slide.subtitle ?? ''}
                onChange={onEdit ? (subtitle) => onEdit({ subtitle }) : undefined}
                style={{ fontSize: LIST_TYPE, color: css('muted') }}
              />
            ) : null}
          </div>
        </div>
      );

    case 'closing':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-[0.6em] text-center">
          <Eyebrow slide={slide} light />
          <Words
            as="h2"
            label="Slide title"
            value={slide.title}
            onChange={onEdit ? (title) => onEdit({ title }) : undefined}
            className="block leading-[1.05]"
            style={{ fontFamily: SERIF, fontSize: BIG_TYPE, color: css('ink') }}
          />
          {slide.body !== undefined || onEdit
            ? body('', { fontSize: LIST_TYPE })
            : slide.bullets?.[0]
              ? <p style={{ fontSize: LIST_TYPE }}>{slide.bullets[0]}</p>
              : null}
        </div>
      );

    case 'statement':
      return (
        <>
          <Heading slide={slide} onEdit={onEdit} />
          <div className="flex flex-1 items-center justify-center px-[6%] text-center">
            {body('leading-[1.2]', { fontFamily: SERIF, fontSize: BIG_TYPE })}
          </div>
        </>
      );

    case 'prompt':
      // A raised white tile; the orange band across the top is gone (C3).
      return (
        <>
          <Heading slide={slide} onEdit={onEdit} />
          <div
            data-testid="tile-card"
            className="relative mx-[4%] flex flex-1 items-center justify-center overflow-hidden px-[6%] text-center"
            style={CARD_STYLE}
          >
            {body('leading-[1.25]', { fontFamily: SERIF, fontSize: BODY_TYPE })}
          </div>
        </>
      );

    case 'quote':
      return (
        <>
          <Heading slide={slide} onEdit={onEdit} />
          <div
            data-testid="tile-card"
            className="relative mx-[4%] flex flex-1 flex-col justify-center gap-[0.5em] px-[8%]"
            style={CARD_STYLE}
          >
            <span
              aria-hidden
              className="absolute left-[3%] top-[2%] leading-none"
              style={{ fontFamily: SERIF, fontSize: 'clamp(3rem, 9cqw, 8rem)', color: css('accent') }}
            >
              “
            </span>
            {body('italic leading-[1.3]', { fontFamily: SERIF, fontSize: BODY_TYPE }, 'blockquote')}
            {slide.attribution || onEdit ? (
              <p style={{ fontSize: LIST_TYPE, color: css('muted') }}>
                —{' '}
                <Words
                  label="Attribution"
                  value={slide.attribution ?? ''}
                  onChange={onEdit ? (attribution) => onEdit({ attribution }) : undefined}
                />
              </p>
            ) : null}
          </div>
        </>
      );

    case 'compare': {
      const longest = Math.max(slide.left?.text.length ?? 0, slide.right?.text.length ?? 0);
      return (
        <>
          <Heading slide={slide} onEdit={onEdit} />
          <div className="grid flex-1 grid-cols-2 gap-[3%]">
            {(['left', 'right'] as const).map((side, index) => {
              const column = slide[side];
              if (!column) return null;
              const set = onEdit
                ? (patch: Partial<{ label: string; text: string }>) =>
                    onEdit({ [side]: { ...column, ...patch } } as Partial<Slide>)
                : undefined;
              return (
                <div key={side} data-testid="tile-card" className="flex flex-col overflow-hidden" style={CARD_STYLE}>
                  <Words
                    as="p"
                    label={`${side === 'left' ? 'Left' : 'Right'} column label`}
                    value={column.label}
                    onChange={set ? (label) => set({ label }) : undefined}
                    className="px-[6%] py-[3%] font-mono tracking-[0.15em]"
                    style={{
                      fontSize: EYEBROW_TYPE,
                      background: index === 0 ? css('accentSoft') : css('wash'),
                      color: css('ink'),
                    }}
                  />
                  <Words
                    as="p"
                    label={`${side === 'left' ? 'Left' : 'Right'} column text`}
                    value={column.text}
                    onChange={set ? (text) => set({ text }) : undefined}
                    className="px-[6%] py-[5%] leading-[1.3]"
                    style={{ fontFamily: SERIF, fontSize: longest > 180 ? PASSAGE_TYPE : LIST_TYPE }}
                  />
                </div>
              );
            })}
          </div>
        </>
      );
    }

    case 'steps': {
      const steps = slide.bullets ?? [];
      const perRow = steps.length <= 4 ? steps.length : Math.ceil(steps.length / 2);
      return (
        <>
          <Heading slide={slide} onEdit={onEdit} />
          <ol
            className="grid content-start gap-[2.5%]"
            style={{ gridTemplateColumns: `repeat(${Math.max(perRow, 1)}, minmax(0, 1fr))` }}
          >
            {steps.map((step, index) => (
              <li key={index} data-testid="tile-card" className="flex flex-col gap-[0.3em] p-[8%]" style={CARD_STYLE}>
                <span className="leading-none" style={{ fontFamily: SERIF, fontSize: TITLE_TYPE, color: css('accent') }}>
                  {index + 1}
                </span>
                <Words
                  label={`Step ${index + 1}`}
                  value={step}
                  onChange={
                    onEdit
                      ? (next) => onEdit({ bullets: steps.map((old, at) => (at === index ? next : old)) })
                      : undefined
                  }
                  className="leading-[1.3]"
                  style={{ fontSize: LIST_TYPE }}
                />
              </li>
            ))}
          </ol>
        </>
      );
    }

    case 'bullets':
    default: {
      const bullets = slide.bullets ?? [];
      return (
        <>
          <Heading slide={slide} onEdit={onEdit} />
          <div
            data-testid="tile-card"
            className="relative flex-1 overflow-hidden py-[3%] pl-[5%] pr-[4%]"
            style={CARD_STYLE}
          >
            {/* A hairline of full-strength colour: a mark, not a block. */}
            <div className="absolute inset-y-0 left-0 w-[0.6%] min-w-[3px]" style={{ background: css('accent') }} aria-hidden />
            <ul className="flex flex-col gap-[0.45em]">
              {bullets.map((bullet, index) => (
                <li key={index} className="flex items-baseline gap-[0.6em] leading-[1.3]" style={{ fontSize: LIST_TYPE }}>
                  <span
                    aria-hidden
                    className="mt-[0.45em] aspect-square w-[0.3em] shrink-0 self-start rounded-full"
                    style={{ background: css('accent') }}
                  />
                  <Words
                    label={`Bullet ${index + 1}`}
                    value={bullet}
                    onChange={
                      onEdit
                        ? (next) => onEdit({ bullets: bullets.map((old, at) => (at === index ? next : old)) })
                        : undefined
                    }
                    className="min-w-0"
                  />
                </li>
              ))}
            </ul>
          </div>
        </>
      );
    }
  }
}

/**
 * A slide drawn at full size and scaled down, for thumbnails: the type is
 * sized for a projector, and shrinking the box alone crowds it.
 */
export function TileSlideThumbnail({
  slide,
  number,
  width,
}: {
  slide: Slide;
  number?: number;
  /** Rendered width in pixels. */
  width: number;
}) {
  const scale = width / 960;
  return (
    <div className="relative overflow-hidden" style={{ width, height: width * (9 / 16) }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: 960, height: 540, transform: `scale(${scale})` }}
      >
        <TileSlideCanvas slide={slide} number={number} />
      </div>
    </div>
  );
}

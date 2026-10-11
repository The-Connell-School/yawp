/**
 * One slide in the YAWP! tile template (Brian's review, E1), matching the
 * PowerPoint export so Present, PDF and PowerPoint agree.
 *
 * Cream page, paper cards with a hairline ring, a mono eyebrow over a serif
 * title, flat terracotta where a class tile has its art. No artwork, no clip
 * art. Sized with container units like the original canvas, so it reads on a
 * laptop and from the back row alike.
 */
import type { Slide, SlideLayout } from '~/domain/lesson-planner/slide-deck';
import { TILE_SLIDE_EYEBROWS } from '~/domain/lesson-planner/tile-theme';

const SERIF = "'Cormorant Garamond', adobe-garamond-pro, Garamond, Georgia, serif";
const TITLE_TYPE = 'clamp(1.5rem, 4.2cqw, 4.25rem)';
const BIG_TYPE = 'clamp(1.6rem, 4.8cqw, 4.75rem)';
const BODY_TYPE = 'clamp(1.1rem, 3.1cqw, 3rem)';
const LIST_TYPE = 'clamp(1rem, 2.4cqw, 2.25rem)';
const EYEBROW_TYPE = 'clamp(0.6rem, 1.1cqw, 1rem)';
const PASSAGE_TYPE = 'clamp(0.85rem, 2cqw, 1.8rem)';

const INK = '#3C3828';
const PAPER = '#FFFEFA';

const CARD =
  'rounded-[0.35em] bg-[#FFFEFA] shadow-sm ring-1 ring-black/5';

function eyebrow(slide: Slide): string {
  const label = TILE_SLIDE_EYEBROWS[slide.layout as SlideLayout].toUpperCase();
  return slide.minutes ? `${label} · ${slide.minutes} MIN` : label;
}

export function TileSlideCanvas({
  slide,
  number,
}: {
  slide: Slide;
  /** 1-based, for the corner. */
  number?: number;
}) {
  const closing = slide.layout === 'closing';
  return (
    <div
      className="@container relative h-full w-full"
      data-layout={slide.layout}
      data-theme="tile"
      style={{ background: closing ? '#D27151' : '#F7F5EE', color: '#3C3828' }}
    >
      {slide.layout === 'title' ? (
        // Full bleed: the colour block runs edge to edge, like a tile's art.
        <div className="absolute inset-0">
          <TileBody slide={slide} />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col px-[5.5%] pb-[7%] pt-[4.5%]">
          <TileBody slide={slide} />
        </div>
      )}
      {/* The wordmark and the slide number, in place of a footer mark. */}
      {!closing && slide.layout !== 'title' ? (
        <span
          className="absolute bottom-[3.5%] left-[5.5%] font-bold text-[#D27151]"
          style={{ fontFamily: SERIF, fontSize: EYEBROW_TYPE }}
        >
          YAWP!
        </span>
      ) : null}
      {number ? (
        <span
          className="absolute bottom-[3.5%] right-[5.5%] font-mono tabular-nums"
          style={{
            fontSize: EYEBROW_TYPE,
            color: closing ? '#FFFEFA' : '#7E7C78',
          }}
        >
          {number}
        </span>
      ) : null}
    </div>
  );
}

function Eyebrow({ slide, light }: { slide: Slide; light?: boolean }) {
  return (
    <p
      className="font-mono tracking-[0.2em]"
      style={{ fontSize: EYEBROW_TYPE, color: light ? '#FFFEFA' : '#D27151' }}
    >
      {eyebrow(slide)}
    </p>
  );
}

function Heading({ slide }: { slide: Slide }) {
  return (
    <div className="mb-[3%]">
      <Eyebrow slide={slide} />
      <h2
        className="leading-[1.1]"
        style={{ fontFamily: SERIF, fontSize: TITLE_TYPE, color: INK }}
      >
        {slide.title}
      </h2>
    </div>
  );
}

function TileBody({ slide }: { slide: Slide }) {
  switch (slide.layout) {
    case 'title':
      return (
        <div className="flex h-full w-full">
          <div className="w-[34%] shrink-0 bg-[#D27151]" aria-hidden />
          <div className="flex flex-1 flex-col justify-center gap-[0.4em] px-[6%]">
            <Eyebrow slide={slide} />
            <h1
              className="leading-[1.05]"
              style={{ fontFamily: SERIF, fontSize: BIG_TYPE, color: INK }}
            >
              {slide.title}
            </h1>
            {slide.subtitle ? (
              <p className="text-[#7E7C78]" style={{ fontSize: LIST_TYPE }}>
                {slide.subtitle}
              </p>
            ) : null}
          </div>
        </div>
      );

    case 'closing':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-[0.6em] text-center text-[#FFFEFA]">
          <Eyebrow slide={slide} light />
          <h2
            className="leading-[1.05]"
            style={{ fontFamily: SERIF, fontSize: BIG_TYPE, color: PAPER }}
          >
            {slide.title}
          </h2>
          {slide.body ?? slide.bullets?.[0] ? (
            <p style={{ fontSize: LIST_TYPE }}>{slide.body ?? slide.bullets?.[0]}</p>
          ) : null}
        </div>
      );

    case 'statement':
      return (
        <>
          <Heading slide={slide} />
          <div className="flex flex-1 items-center justify-center px-[6%] text-center">
            <p
              className="leading-[1.2]"
              style={{ fontFamily: SERIF, fontSize: BIG_TYPE }}
            >
              {slide.body}
            </p>
          </div>
        </>
      );

    case 'prompt':
      return (
        <>
          <Heading slide={slide} />
          <div className={`relative mx-[4%] flex flex-1 items-center justify-center overflow-hidden px-[6%] text-center ${CARD}`}>
            <div className="absolute inset-x-0 top-0 h-[3%] min-h-[4px] bg-[#D27151]" aria-hidden />
            <p
              className="leading-[1.25]"
              style={{ fontFamily: SERIF, fontSize: BODY_TYPE }}
            >
              {slide.body}
            </p>
          </div>
        </>
      );

    case 'quote':
      return (
        <>
          <Heading slide={slide} />
          <div className={`relative mx-[4%] flex flex-1 flex-col justify-center gap-[0.5em] px-[8%] ${CARD}`}>
            <span
              aria-hidden
              className="absolute left-[3%] top-[2%] leading-none text-[#D27151]"
              style={{ fontFamily: SERIF, fontSize: 'clamp(3rem, 9cqw, 8rem)' }}
            >
              “
            </span>
            <blockquote
              className="italic leading-[1.3]"
              style={{ fontFamily: SERIF, fontSize: BODY_TYPE }}
            >
              {slide.body}
            </blockquote>
            {slide.attribution ? (
              <p className="text-[#7E7C78]" style={{ fontSize: LIST_TYPE }}>
                — {slide.attribution}
              </p>
            ) : null}
          </div>
        </>
      );

    case 'compare': {
      const longest = Math.max(
        slide.left?.text.length ?? 0,
        slide.right?.text.length ?? 0
      );
      return (
        <>
          <Heading slide={slide} />
          <div className="grid flex-1 grid-cols-2 gap-[3%]">
            {[slide.left, slide.right].map((column, index) =>
              column ? (
                <div key={index} className={`flex flex-col overflow-hidden ${CARD}`}>
                  <p
                    className="px-[6%] py-[3%] font-mono tracking-[0.15em]"
                    style={{
                      fontSize: EYEBROW_TYPE,
                      background: index === 0 ? '#D27151' : '#E6E2D6',
                      color: index === 0 ? '#FFFEFA' : '#3C3828',
                    }}
                  >
                    {column.label}
                  </p>
                  <p
                    className="px-[6%] py-[5%] leading-[1.3]"
                    style={{
                      fontFamily: SERIF,
                      fontSize: longest > 180 ? PASSAGE_TYPE : LIST_TYPE,
                    }}
                  >
                    {column.text}
                  </p>
                </div>
              ) : null
            )}
          </div>
        </>
      );
    }

    case 'steps': {
      const steps = slide.bullets ?? [];
      const perRow = steps.length <= 4 ? steps.length : Math.ceil(steps.length / 2);
      return (
        <>
          <Heading slide={slide} />
          <ol
            className="grid content-start gap-[2.5%]"
            style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
          >
            {steps.map((step, index) => (
              <li key={index} className={`flex flex-col gap-[0.3em] p-[8%] ${CARD}`}>
                <span
                  className="leading-none text-[#D27151]"
                  style={{ fontFamily: SERIF, fontSize: TITLE_TYPE }}
                >
                  {index + 1}
                </span>
                <span className="leading-[1.3]" style={{ fontSize: LIST_TYPE }}>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </>
      );
    }

    case 'bullets':
    default:
      return (
        <>
          <Heading slide={slide} />
          <div className={`relative flex-1 overflow-hidden py-[3%] pl-[5%] pr-[4%] ${CARD}`}>
            <div className="absolute inset-y-0 left-0 w-[1%] min-w-[4px] bg-[#D27151]" aria-hidden />
            <ul className="flex flex-col gap-[0.45em]">
              {slide.bullets?.map((bullet, index) => (
                <li
                  key={index}
                  className="flex items-baseline gap-[0.6em] leading-[1.3]"
                  style={{ fontSize: LIST_TYPE }}
                >
                  <span aria-hidden className="mt-[0.45em] aspect-square w-[0.3em] shrink-0 self-start rounded-full bg-[#D27151]" />
                  <span className="min-w-0">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      );
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
    <div
      className="relative overflow-hidden"
      style={{ width, height: width * (9 / 16) }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: 960, height: 540, transform: `scale(${scale})` }}
      >
        <TileSlideCanvas slide={slide} number={number} />
      </div>
    </div>
  );
}

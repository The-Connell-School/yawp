/**
 * A gallery slide in the Yawp! Lesson Deck Kit, spec v4, drawn from its
 * layout (`layoutKitV4Slide`) on a 1280×720 design canvas that scales with
 * its box: every size is a kit pixel, in `u` (1/1280 of the slide's width).
 * The same boxes PowerPoint and the PDF draw, so all three hang one slide.
 *
 * Given `edit` (the deck studio, Nov 19), the words on the slide are typed
 * in place: each run the layout drew from a field is a text box that writes
 * back to that field, and the slide's picture is a button. Without it, the
 * slide is drawn exactly as before.
 */
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { ImagePlus } from 'lucide-react';
import { SlidePicture } from '~/components/lesson-planner/slide-picture';
import { BrandSafe } from '~/components/brand/brand-safe';
import {
  KIT_V4_FONTS,
  isKitV41,
  layoutKitV4Slide,
  type KitV4Element,
  type KitV4Para,
  type KitV4Run,
  type KitV4Source,
} from '~/domain/lesson-planner/deck-kit-v4';
import { sourceKey, sourceLabel, sourceLimit } from '~/domain/lesson-planner/deck-on-slide';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';

/** What the deck studio does with a slide that is typed on. */
export type KitV4SlideEdit = {
  /** What the teacher typed into a run, for the field it was drawn from. */
  onText: (source: KitV4Source, text: string) => void;
  /** Enter in a list line: a new line after it. */
  onEnter?: (source: KitV4Source) => void;
  /** Backspace in an empty list line: the line goes. */
  onRemove?: (source: KitV4Source) => void;
  /** The box the teacher is in; null when they leave it. */
  onFocus?: (source: KitV4Source | null) => void;
  /** A click on the slide's own picture. */
  onPicture?: () => void;
};

/** A kit pixel, at whatever size the slide is drawn. */
const u = (px: number) => `calc(${px} * 100cqw / 1280)`;

const JUSTIFY: Record<'top' | 'middle' | 'bottom', CSSProperties['justifyContent']> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
};

/** Before paint in the browser; on the server (where there is no DOM to keep) a plain effect, which never runs. */
const useDomEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function caretToEnd(node: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * A run's words, typed in place. The DOM is left alone while the teacher
 * types, so the caret never jumps when the layout re-flows or the type steps
 * down a size around them. An emptied box is not written until they leave
 * it: the layout drops an empty line, and the box would go with it.
 */
function EditableWords({ words, source, edit }: { words: string; source: KitV4Source; edit: KitV4SlideEdit }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Drawn once by React (so the server's page has the words), then kept by hand.
  const [first] = useState(() => ({ __html: escapeHtml(words) }));
  const [left, leave] = useReducer((count: number) => count + 1, 0);
  useDomEffect(() => {
    const node = ref.current;
    if (node && document.activeElement !== node && node.textContent !== words) node.textContent = words;
  }, [words, left]);

  const limit = sourceLimit(source);
  const live = source.commit !== 'blur';
  const isListLine = source.index !== undefined;
  return (
    <span
      ref={ref}
      role="textbox"
      tabIndex={0}
      aria-label={sourceLabel(source)}
      data-testid="slide-words"
      data-source={sourceKey(source)}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      dangerouslySetInnerHTML={first}
      onFocus={() => edit.onFocus?.(source)}
      onInput={(event) => {
        const node = event.currentTarget;
        let text = node.textContent ?? '';
        if (text.length > limit) {
          text = text.slice(0, limit);
          node.textContent = text;
          caretToEnd(node);
        }
        if (live && text.trim()) edit.onText(source, text);
      }}
      onBlur={(event) => {
        const text = event.currentTarget.textContent ?? '';
        if (text !== words) edit.onText(source, text);
        // Put back what the deck holds, whatever it made of that.
        leave();
      }}
      onKeyDown={(event) => {
        const node = event.currentTarget;
        if (event.key === 'Enter') {
          // One line per field: Enter finishes it, or starts the list's next line.
          event.preventDefault();
          const text = node.textContent ?? '';
          if (isListLine && edit.onEnter && text.trim()) {
            if (text !== words) edit.onText(source, text);
            edit.onEnter(source);
          } else {
            node.blur();
          }
        } else if (event.key === 'Backspace' && isListLine && edit.onRemove && !(node.textContent ?? '')) {
          event.preventDefault();
          edit.onRemove(source);
        } else if (event.key === 'Escape') {
          node.blur();
        }
      }}
      onPaste={(event) => {
        // Words only: never the look of wherever they were copied from.
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain').replace(/\s+/g, ' ');
        if (text) document.execCommand('insertText', false, text);
      }}
      className="cursor-text rounded-[0.12em] outline-none ring-[#1F4D3A]/60 hover:ring-1 focus:ring-2"
      style={{ outlineOffset: '0.1em' }}
    />
  );
}

function Run({ run, edit }: { run: KitV4Run; edit?: KitV4SlideEdit }) {
  const style: CSSProperties = {
    fontFamily: KIT_V4_FONTS[run.face],
    // Fraunces (spec v4.1) is always bold; Georgia never is.
    fontWeight: run.face === 'display' || (run.face === 'sans' && run.bold) ? 700 : 400,
    fontStyle: 'normal',
    fontSize: u(run.size),
    color: run.color,
    letterSpacing: run.face === 'serif' && run.size >= 52 ? '-0.01em' : undefined,
  };
  if (!edit || !run.source) {
    return (
      <span style={style}>
        <BrandSafe>{run.text}</BrandSafe>
      </span>
    );
  }
  // The layout's own characters around the field's words stay as they are.
  const lead = run.source.lead ?? 0;
  const end = run.text.length - (run.source.trail ?? 0);
  return (
    <span style={style}>
      {lead ? run.text.slice(0, lead) : null}
      <EditableWords words={run.text.slice(lead, end)} source={run.source} edit={edit} />
      {end < run.text.length ? run.text.slice(end) : null}
    </span>
  );
}

function Para({ para, align, snug, edit }: { para: KitV4Para; align?: 'left' | 'right'; snug: boolean; edit?: KitV4SlideEdit }) {
  const largest = Math.max(...para.runs.map((run) => run.size));
  return (
    <p
      style={{
        margin: 0,
        // Spec v4.1: the paragraph is as tall as its own type, so a line of
        // small type (a credit, the teacher's name) is not held open by the
        // page's 16px in a thumbnail.
        fontSize: snug ? u(largest) : undefined,
        marginBottom: para.after ? u(para.after) : 0,
        lineHeight: para.leading ?? (largest >= 44 ? 1.1 : 1.35),
        textAlign: align ?? 'left',
        whiteSpace: 'pre-wrap',
      }}
    >
      {para.runs.map((run, i) => (
        <Run key={run.source && edit ? sourceKey(run.source) : i} run={run} edit={edit} />
      ))}
    </p>
  );
}

function Element({ element, snug, edit }: { element: KitV4Element; snug: boolean; edit?: KitV4SlideEdit }) {
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
      if (edit?.onPicture) {
        return (
          <button
            type="button"
            data-testid="slide-picture-swap"
            aria-label="Swap this picture"
            onClick={edit.onPicture}
            className="group cursor-pointer border-0 bg-transparent p-0 outline-none ring-[#1F4D3A]/60 hover:ring-2 focus-visible:ring-2"
            style={box}
          >
            <SlidePicture id={element.id} tone="light" />
            <span
              className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-[#1F4D3A] px-3 py-1.5 text-xs font-semibold text-white opacity-90 group-hover:opacity-100"
              style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
            >
              <ImagePlus size={13} aria-hidden />
              Swap picture
            </span>
          </button>
        );
      }
      return (
        <div style={box}>
          <SlidePicture id={element.id} tone="light" />
        </div>
      );
    case 'text':
      return (
        <div
          data-testid={element.role === 'credit' ? 'gallery-credit' : element.role === 'running-head' ? 'gallery-running-head' : undefined}
          style={{
            ...box,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: JUSTIFY[element.valign],
            // Typed on, a box shows all its words, so none are lost from view mid-edit.
            overflow: edit ? 'visible' : 'hidden',
          }}
        >
          {element.paras.map((para, i) => (
            <Para key={i} para={para} align={element.align} snug={snug} edit={edit} />
          ))}
        </div>
      );
  }
}

export function KitV4SlideCanvas({ deck, index, edit }: { deck: SlideDeck; index: number; edit?: KitV4SlideEdit }) {
  if (!deck.slides[index]) return null;
  const layout = layoutKitV4Slide(deck, index);
  const v41 = isKitV41(deck);
  return (
    <div
      className="@container relative h-full w-full overflow-hidden"
      data-layout={deck.slides[index]!.layout}
      data-template={layout.template}
      data-ground="cream"
      data-theme="kit-v4"
      data-kit={v41 ? 'v4.1' : 'v4'}
      style={{ background: layout.background, fontFamily: KIT_V4_FONTS.sans }}
    >
      {layout.elements.map((element, i) => (
        <Element key={i} element={element} snug={v41} edit={edit} />
      ))}
    </div>
  );
}

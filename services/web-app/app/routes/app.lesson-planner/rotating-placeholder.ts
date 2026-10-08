/**
 * The ghost text in the planner's box, which types itself out while nobody is
 * using the box.
 *
 * An empty box with "Describe the lesson…" in it tells a teacher the shape of
 * the answer but nothing about the range of it. These examples do the teaching
 * instead: each one is a real ask, with a class, a constraint, and a room, so
 * the box reads as somewhere you can say the messy thing rather than a search
 * field expecting a keyword.
 *
 * They arrive a letter at a time rather than all at once. A sentence that
 * appears whole reads as a label the page is showing you; a sentence being
 * typed reads as somebody talking, which is the thing the box is asking for.
 */
import { useEffect, useState } from 'react';

export const PLACEHOLDER_EXAMPLES = [
  'Ninth grade, 48 minutes. They can find a quote but not say why it matters.',
  'Tomorrow is the Dust Bowl. Third period talks over each other constantly.',
  'A thesis lesson for kids who write one sentence and call it a paragraph.',
  'Same objective, two sections: one will discuss, one will not look up.',
  'Two days on counterargument. Half of them think it means disagreeing.',
  'They bombed the last quiz on theme. Start over, but not from scratch.',
  'An exit ticket I can sort in the six minutes between fourth and fifth.',
  'Slides for Friday on citing sources, with notes I can read while teaching.',
];

/** One character, at about the pace of somebody typing rather than a ticker. */
const TYPE_MS = 42;
/** How long a finished sentence sits still before it is taken back. */
const HOLD_MS = 2600;
/** Backspacing is faster than typing, the way it is under a real hand. */
const ERASE_MS = 16;
/** A beat on the empty box, so one example doesn't run into the next. */
const CLEAR_MS = 420;

type Phase = 'typing' | 'holding' | 'erasing';

export type PlaceholderState = {
  /** Which example, as an index that wraps rather than running out. */
  index: number;
  /** How much of it is currently on screen. */
  chars: number;
  phase: Phase;
};

export const INITIAL_PLACEHOLDER_STATE: PlaceholderState = {
  index: 0,
  chars: 0,
  phase: 'typing',
};

/** Cycles through the examples, wrapping rather than running out. */
export function placeholderFor(tick: number): string {
  return PLACEHOLDER_EXAMPLES[tick % PLACEHOLDER_EXAMPLES.length];
}

/** What the box shows at this point in the typing. */
export function placeholderText(
  state: PlaceholderState,
  examples: readonly string[] = PLACEHOLDER_EXAMPLES
): string {
  return examples[state.index % examples.length].slice(0, state.chars);
}

/**
 * The next frame: one more letter, one fewer letter, or the turn from one into
 * the other. Kept pure so the pacing can be read without a clock.
 */
export function advancePlaceholder(
  state: PlaceholderState,
  examples: readonly string[] = PLACEHOLDER_EXAMPLES
): PlaceholderState {
  const full = examples[state.index % examples.length];

  if (state.phase === 'typing') {
    if (state.chars >= full.length) return { ...state, phase: 'holding' };
    return { ...state, chars: state.chars + 1 };
  }

  if (state.phase === 'holding') {
    return { ...state, chars: Math.max(0, state.chars - 1), phase: 'erasing' };
  }

  if (state.chars <= 0) {
    return {
      index: (state.index + 1) % examples.length,
      chars: 0,
      phase: 'typing',
    };
  }
  return { ...state, chars: state.chars - 1 };
}

/** How long this frame stays on screen before the next one. */
export function placeholderDelay(state: PlaceholderState): number {
  if (state.phase === 'holding') return HOLD_MS;
  if (state.phase === 'erasing') return state.chars <= 0 ? CLEAR_MS : ERASE_MS;
  return TYPE_MS;
}

export function shouldRotatePlaceholder({
  typed,
  reducedMotion,
}: {
  /** Whether the teacher has put anything in the box. */
  typed: boolean;
  reducedMotion: boolean;
}): boolean {
  return !typed && !reducedMotion;
}

/**
 * The example currently being typed. Falls back to the whole sentence, sitting
 * still, for a teacher who has asked for less motion — and for one who has
 * started typing, so the box never animates under a cursor already in it.
 */
export function useRotatingPlaceholder(typed: boolean): string {
  const [state, setState] = useState<PlaceholderState>(
    INITIAL_PLACEHOLDER_STATE
  );
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!shouldRotatePlaceholder({ typed, reducedMotion })) return;
    const timer = window.setTimeout(
      () => setState(advancePlaceholder),
      placeholderDelay(state)
    );
    return () => window.clearTimeout(timer);
  }, [typed, reducedMotion, state]);

  if (!shouldRotatePlaceholder({ typed, reducedMotion })) {
    return placeholderFor(state.index);
  }
  return placeholderText(state);
}

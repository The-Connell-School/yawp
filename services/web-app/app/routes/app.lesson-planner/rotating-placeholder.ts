/**
 * The ghost text in the planner's box, which changes while nobody is typing.
 *
 * An empty box with "Describe the lesson…" in it tells a teacher the shape of
 * the answer but nothing about the range of it. These examples do the teaching
 * instead: each one is a real ask, with a class, a constraint, and a room, so
 * the box reads as somewhere you can say the messy thing rather than a search
 * field expecting a keyword.
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

const ROTATE_MS = 5200;

/** Cycles through the examples, wrapping rather than running out. */
export function placeholderFor(tick: number): string {
  return PLACEHOLDER_EXAMPLES[tick % PLACEHOLDER_EXAMPLES.length];
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
 * The current example. Freezes on the one showing when the teacher starts
 * typing, so the box never changes under a cursor that is already in it.
 */
export function useRotatingPlaceholder(typed: boolean): string {
  const [tick, setTick] = useState(0);
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
    const timer = window.setInterval(
      () => setTick((current) => current + 1),
      ROTATE_MS
    );
    return () => window.clearInterval(timer);
  }, [typed, reducedMotion]);

  return placeholderFor(tick);
}

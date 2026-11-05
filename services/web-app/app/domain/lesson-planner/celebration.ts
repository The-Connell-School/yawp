/**
 * "This lesson is set" (Brian's round 4, item 4): a burst of confetti, one
 * Yawp! logo rising through it, and Brian's own "Yaaawp!". The pieces and
 * the sound are worked out here; the overlay draws them.
 */

/** Yawp! coral, purple, gold, teal and blush. */
export const CELEBRATION_COLORS = ['#D9714F', '#7B4FB0', '#E3B341', '#3E9C86', '#F2C6B4'] as const;

/** Brian's recording: three takes of "Yaaawp!" stacked, 1.1 seconds (round 4 follow-up). */
export const YAWP_SOUND = '/lesson-planner/sounds/yaaawp.mp3';

export type ConfettiPiece = {
  x: number;
  y: number;
  /** Pixels per second. */
  vx: number;
  vy: number;
  size: number;
  color: (typeof CELEBRATION_COLORS)[number];
  rotation: number;
  /** Radians per second. */
  spin: number;
  shape: 'strip' | 'dot';
};

const GRAVITY = 900;
const DRAG = 0.9;

/** The pieces at the moment of the burst: all at the middle, flying up and out. */
export function celebrationPieces(
  count: number,
  screen: { width: number; height: number },
  random: () => number = Math.random
): ConfettiPiece[] {
  const x = screen.width / 2;
  const y = Math.round(screen.height * 0.55);
  const reach = Math.max(screen.width, screen.height);
  return Array.from({ length: count }, (_, index) => {
    // Up, and out to either side: between 20° and 160° above the horizon.
    const angle = Math.PI * (0.11 + random() * 0.78);
    const speed = reach * (0.55 + random() * 0.75);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      size: 6 + random() * 7,
      color: CELEBRATION_COLORS[index % CELEBRATION_COLORS.length]!,
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 14,
      shape: random() < 0.7 ? 'strip' : 'dot',
    };
  });
}

/** A piece, `seconds` later. */
export function stepPiece(piece: ConfettiPiece, seconds: number): ConfettiPiece {
  const drag = Math.pow(DRAG, seconds * 10);
  const vx = piece.vx * drag;
  const vy = piece.vy * drag + GRAVITY * seconds;
  return {
    ...piece,
    vx,
    vy,
    x: piece.x + vx * seconds,
    y: piece.y + vy * seconds,
    rotation: piece.rotation + piece.spin * seconds,
  };
}

/**
 * Plays "Yaaawp!". It runs off the teacher's click, so the browser lets it
 * make a sound; where it can't, the confetti still flies.
 */
export function playYawp(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  try {
    void new Audio(YAWP_SOUND).play().catch(() => {});
  } catch {
    // No sound is no loss.
  }
}

/**
 * "This lesson is set" (Brian's round 4, item 4): a burst of confetti, one
 * Yawp! logo rising through it, and a voice saying "Yaaaawp!". The pieces
 * and the voice are worked out here; the overlay draws them.
 */

/** Yawp! coral, purple, gold, teal and blush. */
export const CELEBRATION_COLORS = ['#D9714F', '#7B4FB0', '#E3B341', '#3E9C86', '#F2C6B4'] as const;

/** What the voice says. */
export const YAWP_LINE = 'Yaaaawp!';

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

type Voice = { name: string; lang: string };

const MAN = /\bmale\b|daniel|alex\b|fred|david|mark\b|aaron|arthur|rishi|tom\b|guy|james|lee\b|oliver|gordon/i;
const WOMAN = /female|samantha|victoria|karen|moira|tessa|zira|fiona|susan|serena|allison|ava\b/i;

/** A man's English voice if the browser has one, else any English voice, else none (the default). */
export function pickYawpVoice<T extends Voice>(voices: readonly T[]): T | null {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  return english.find((voice) => MAN.test(voice.name) && !WOMAN.test(voice.name)) ?? english[0] ?? null;
}

/**
 * Says "Yaaaawp!", low and drawn out. It runs off the teacher's click, so the
 * browser lets it make a sound. A recording can take its place here.
 */
export function sayYawp(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    const line = new SpeechSynthesisUtterance(YAWP_LINE);
    const voice = pickYawpVoice(window.speechSynthesis.getVoices());
    if (voice) {
      line.voice = voice;
      line.lang = voice.lang;
    } else {
      line.lang = 'en-US';
    }
    line.pitch = 0.6;
    line.rate = 0.7;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(line);
  } catch {
    // No voice is no loss: the confetti still flies.
  }
}

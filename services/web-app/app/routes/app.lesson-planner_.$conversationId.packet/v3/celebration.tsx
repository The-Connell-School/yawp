/**
 * Setting the lesson (Brian's round 5, item 11): the one place in the product
 * for sparkles. A burst of confetti over the finish line and the yawp line,
 * once, for a couple of seconds, never in the way: nothing here takes a
 * click. With Reduce Motion on, the line shows and nothing moves.
 */
import { useEffect, useRef } from 'react';

export const YAWP_LINE = 'Hear me yawp, hear me yawp, hear me yaaaaaawp!';
/** How long it plays before the page settles into the set state. */
export const CELEBRATION_MS = 2600;
const CONFETTI_MS = 1600;
const PIECES = 80;
const COLORS = ['#7B4FB0', '#D9714F', '#C99A3E', '#3E9A84', '#5E7DB8', '#C2577F'];

/** What plays: confetti only for those who have not asked for less motion. */
export function celebrationParts(reducedMotion: boolean): { confetti: boolean; line: string } {
  return { confetti: !reducedMotion, line: YAWP_LINE };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function Celebration({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = celebrationParts(prefersReducedMotion());

  // Once, however often the page around it renders.
  const finish = useRef(onDone);
  finish.current = onDone;
  useEffect(() => {
    const done = window.setTimeout(() => finish.current(), CELEBRATION_MS);
    return () => window.clearTimeout(done);
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!parts.confetti || !element || !context) return;
    const width = (element.width = element.offsetWidth * window.devicePixelRatio);
    const height = (element.height = element.offsetHeight * window.devicePixelRatio);
    const scale = window.devicePixelRatio;
    // From the button at the bottom of the card, up and out.
    const pieces = Array.from({ length: PIECES }, () => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: height * 0.85,
      vx: (Math.random() - 0.5) * 9 * scale,
      vy: -(6 + Math.random() * 9) * scale,
      size: (5 + Math.random() * 5) * scale,
      spin: Math.random() * Math.PI,
      turn: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    }));
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const elapsed = now - start;
      context.clearRect(0, 0, width, height);
      if (elapsed > CONFETTI_MS) return;
      context.globalAlpha = Math.min(1, (CONFETTI_MS - elapsed) / 400);
      for (const piece of pieces) {
        piece.vy += 0.35 * scale;
        piece.vx *= 0.99;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.spin += piece.turn;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.fillStyle = piece.color;
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [parts.confetti]);

  const words = parts.line.split(' ');
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 z-20">
      <style>{`
        @keyframes yawp-pop { 0% { opacity: 0; transform: translateY(8px) scale(.6) } 60% { opacity: 1; transform: translateY(-2px) scale(1.08) } 100% { opacity: 1; transform: none } }
        @keyframes yawp-out { to { opacity: 0 } }
        .yawp-word { display: inline-block; opacity: 0; animation: yawp-pop .32s cubic-bezier(.2,.9,.3,1.3) forwards }
        .yawp-line { animation: yawp-out .4s ease-in ${CELEBRATION_MS - 400}ms forwards }
        @media (prefers-reduced-motion: reduce) { .yawp-word { opacity: 1; animation: none } .yawp-line { animation: none } }
      `}</style>
      {parts.confetti ? <canvas ref={canvas} data-testid="confetti" className="absolute inset-0 h-full w-full" /> : null}
      <p
        role="status"
        data-testid="yawp-line"
        className="yawp-line absolute inset-x-2 top-0 text-center text-lg font-extrabold leading-tight text-[var(--sv-writing)]"
      >
        {words.map((word, index) => (
          <span key={index} className="yawp-word" style={{ animationDelay: `${index * 110}ms` }}>
            {word}
            {index < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </p>
    </div>
  );
}

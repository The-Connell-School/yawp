/**
 * "This lesson is set" (Brian's round 4, item 4): confetti bursts from the
 * middle of the screen, one Yawp! logo rises through it, and Brian's
 * "Yaaawp!" plays. It never takes a click, and it's gone in about three
 * seconds. With reduced motion there's no confetti: the logo fades in and out.
 *
 * The sound (`playYawp`) is started by the click itself, where the browser
 * allows sound, not here.
 */
import { useEffect, useRef, useState } from 'react';
import { celebrationPieces, stepPiece } from '~/domain/lesson-planner/celebration';

const LENGTH_MS = 3200;
/** The logo leaves before the confetti settles, in one smooth fade (Brian, Oct 29). */
const LOGO_MS = 2300;
const PIECES = 160;

const KEYFRAMES = `
@keyframes yawp-rise {
  0% { transform: translateY(60px) scale(0.2) rotate(-12deg); opacity: 0; animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1); }
  38% { transform: translateY(-10px) scale(1.12) rotate(4deg); opacity: 1; animation-timing-function: ease-out; }
  52% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
  68% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1); }
  100% { transform: translateY(-12px) scale(0.97); opacity: 0; }
}
@keyframes yawp-fade {
  0% { opacity: 0; animation-timing-function: ease-out; }
  20% { opacity: 1; }
  68% { opacity: 1; animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1); }
  100% { opacity: 0; }
}`;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function LessonSetCelebration({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [still] = useState(prefersReducedMotion);

  useEffect(() => {
    const done = window.setTimeout(onDone, LENGTH_MS);
    return () => window.clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext('2d');
    if (still || !node || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    node.width = width * ratio;
    node.height = height * ratio;
    context.scale(ratio, ratio);
    let pieces = celebrationPieces(PIECES, { width, height });
    const start = performance.now();
    let last = start;
    let frame = 0;
    const draw = (now: number) => {
      const seconds = Math.min(0.05, (now - last) / 1000);
      last = now;
      pieces = pieces.map((piece) => stepPiece(piece, seconds));
      // The last half second fades out.
      const left = LENGTH_MS - (now - start);
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.max(0, Math.min(1, left / 500));
      for (const piece of pieces) {
        if (piece.y > height + 20) continue;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        if (piece.shape === 'dot') {
          context.beginPath();
          context.arc(0, 0, piece.size / 2.5, 0, Math.PI * 2);
          context.fill();
        } else {
          // A strip, turning: its width follows the spin.
          context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, (piece.size / 2) * Math.abs(Math.cos(piece.rotation * 1.7)) + 1);
        }
        context.restore();
      }
      if (left > 0) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [still]);

  return (
    <div
      data-testid="lesson-set-celebration"
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
    >
      <style>{KEYFRAMES}</style>
      {still ? null : <canvas ref={canvas} aria-hidden data-testid="celebration-confetti" className="absolute inset-0 h-full w-full" />}
      {/* A soft glow behind the logo, so it reads over a busy page. */}
      <div
        className="relative rounded-full bg-[radial-gradient(closest-side,rgba(255,250,243,0.95),rgba(255,250,243,0.7)_60%,rgba(255,250,243,0))] px-[12vw] py-[10vw] min-[700px]:px-24 min-[700px]:py-20"
        style={{
          animation: `${still ? 'yawp-fade' : 'yawp-rise'} ${LOGO_MS}ms linear both`,
          animationDelay: still ? '0ms' : '150ms',
        }}
      >
        <img
          src="/img/yawp_black_logo.png"
          alt="Yawp!"
          data-testid="celebration-logo"
          className="w-[min(56vw,360px)] drop-shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
        />
      </div>
    </div>
  );
}

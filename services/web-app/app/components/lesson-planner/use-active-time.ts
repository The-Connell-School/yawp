/**
 * The page's planning clock (Nov 3): counts the seconds a teacher is working
 * on a lesson and reports them, so "Planned in" is working time.
 *
 * A second counts while the page is in front of the teacher (visible and
 * focused) and they have clicked, typed or scrolled in the last few minutes,
 * or while they are waiting on the planner's reply. What is counted is sent
 * every half minute, and when the page is hidden or left. Time spent before
 * a new lesson's first message waits and goes to that lesson once it exists.
 */
import { useEffect, useRef } from 'react';
import { ACTIVE_FLUSH_MS, activeTick, type ActiveClock } from '~/domain/lesson-planner/active-time';

const API = '/api/domain/lesson-planner/active-time';
const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

function send(conversationId: string, seconds: number, leaving: boolean) {
  const form = new FormData();
  form.set('conversationId', conversationId);
  form.set('seconds', String(seconds));
  // A page being left cannot wait for a fetch; a beacon survives it.
  if (leaving && typeof navigator !== 'undefined' && navigator.sendBeacon?.(API, form)) return;
  void fetch(API, { method: 'POST', body: form, keepalive: true }).catch(() => undefined);
}

export function useActiveTime({
  conversationId,
  enabled,
  waiting = false,
}: {
  /** Null for a new lesson before its first message. */
  conversationId: string | null | undefined;
  enabled: boolean;
  /** The planner is answering: waiting on it is working. */
  waiting?: boolean;
}) {
  const clock = useRef<ActiveClock>({ pending: 0, lastInput: Date.now() });
  const lesson = useRef<string | null>(conversationId ?? null);
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;

  // Another lesson: what was counted belongs to the one before.
  useEffect(() => {
    const previous = lesson.current;
    const next = conversationId ?? null;
    if (previous && previous !== next && clock.current.pending > 0) {
      send(previous, clock.current.pending, false);
      clock.current = { ...clock.current, pending: 0 };
    }
    lesson.current = next;
  }, [conversationId]);

  useEffect(() => {
    if (!enabled) return;
    const flush = (leaving: boolean) => {
      const id = lesson.current;
      const seconds = clock.current.pending;
      if (!id || seconds <= 0) return;
      clock.current = { ...clock.current, pending: 0 };
      send(id, seconds, leaving);
    };
    const touched = () => {
      clock.current = { ...clock.current, lastInput: Date.now() };
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const left = () => flush(true);

    const tick = window.setInterval(() => {
      clock.current = activeTick(clock.current, {
        now: Date.now(),
        visible: document.visibilityState === 'visible',
        focused: document.hasFocus(),
        waiting: waitingRef.current,
      });
    }, 1000);
    const report = window.setInterval(() => flush(false), ACTIVE_FLUSH_MS);
    for (const input of INPUTS) window.addEventListener(input, touched, { passive: true, capture: true });
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', left);
    return () => {
      flush(true);
      window.clearInterval(tick);
      window.clearInterval(report);
      for (const input of INPUTS) window.removeEventListener(input, touched, { capture: true });
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', left);
    };
  }, [enabled]);
}

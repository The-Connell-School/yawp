/**
 * Time a teacher spends with a lesson open and in use (Brian's round 5, item
 * 12): "Planned in" counts this, not the clock time from the first message to
 * set. A tab left open counts nothing once nobody has touched it for a couple
 * of minutes, and a hidden tab counts nothing at all.
 */
import { useEffect } from 'react';

const STACK_API = '/api/domain/lesson-planner/stack';
/** How often the page asks itself "is anyone here?". */
export const TICK_SECONDS = 15;
/** Without a click, a key or a scroll this long, the teacher has stepped away. */
export const IDLE_AFTER_SECONDS = 120;
/** How much is saved up before it is sent; the server takes at most 120. */
const SEND_AT_SECONDS = 60;

/** Whether this tick counts. */
export function inUse({ visible, lastInputAt, now }: { visible: boolean; lastInputAt: number; now: number }): boolean {
  return visible && now - lastInputAt < IDLE_AFTER_SECONDS * 1000;
}

export function useActiveTime(conversationId: string | null | undefined, enabled = true) {
  useEffect(() => {
    if (!conversationId || !enabled || typeof document === 'undefined') return;
    let lastInputAt = Date.now();
    let pending = 0;
    const touched = () => {
      lastInputAt = Date.now();
    };
    const send = () => {
      if (pending <= 0) return;
      const seconds = Math.min(120, pending);
      pending = 0;
      const body = new URLSearchParams({ intent: 'active-time', conversationId, seconds: String(seconds) });
      // A beacon still goes when the tab is closing.
      if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(STACK_API, body)) return;
      void fetch(STACK_API, { method: 'POST', body, keepalive: true }).catch(() => {});
    };
    const tick = window.setInterval(() => {
      if (!inUse({ visible: document.visibilityState === 'visible', lastInputAt, now: Date.now() })) return;
      pending += TICK_SECONDS;
      if (pending >= SEND_AT_SECONDS) send();
    }, TICK_SECONDS * 1000);
    const hidden = () => {
      if (document.visibilityState === 'hidden') send();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart', 'input'] as const;
    for (const name of events) window.addEventListener(name, touched, { passive: true, capture: true });
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', send);
    return () => {
      window.clearInterval(tick);
      for (const name of events) window.removeEventListener(name, touched, { capture: true });
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', send);
      send();
    };
  }, [conversationId, enabled]);
}

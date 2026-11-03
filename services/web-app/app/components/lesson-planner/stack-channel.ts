/**
 * The stack is the same everywhere (Brian's run 3, item 2): a change on the
 * stack page shows in an open planner tab, and the other way round. Tabs on
 * one device tell each other over a BroadcastChannel; a tab that comes back
 * into view re-reads the stack too, which covers everything else.
 */
import { useEffect, useRef } from 'react';

function channelName(conversationId: string) {
  return `yawp-lesson-stack:${conversationId}`;
}

export function announceStackChange(conversationId: string | null | undefined) {
  if (!conversationId || typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(channelName(conversationId));
    channel.postMessage({ type: 'stack-changed', at: Date.now() });
    channel.close();
  } catch {
    // A browser without the channel still re-reads the stack on focus.
  }
}

/** Calls `onChange` when another tab changes this stack, or this tab returns. */
export function useStackChanges(
  conversationId: string | null | undefined,
  onChange: () => void
) {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    if (!conversationId) return;
    const fire = () => latest.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible') fire();
    };
    window.addEventListener('focus', fire);
    document.addEventListener('visibilitychange', onVisible);
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(channelName(conversationId));
      channel.onmessage = fire;
    }
    return () => {
      window.removeEventListener('focus', fire);
      document.removeEventListener('visibilitychange', onVisible);
      channel?.close();
    };
  }, [conversationId]);
}

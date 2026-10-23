/**
 * Run the show and the projector (stack page redesign, Run the show): the
 * teacher's view moves the slides. Both windows are on the same computer, so
 * a BroadcastChannel carries it; the projector answers a ping so the show
 * can say it is following.
 */
import { useEffect, useRef } from 'react';

export type ShowMessage =
  | { type: 'slide'; index: number }
  | { type: 'ping' }
  | { type: 'projector-here' };

function channelName(conversationId: string) {
  return `yawp-show:${conversationId}`;
}

export function useShowChannel(
  conversationId: string | null | undefined,
  onMessage: (message: ShowMessage) => void
): (message: ShowMessage) => void {
  const channel = useRef<BroadcastChannel | null>(null);
  const latest = useRef(onMessage);
  latest.current = onMessage;
  useEffect(() => {
    if (!conversationId || typeof BroadcastChannel === 'undefined') return;
    const opened = new BroadcastChannel(channelName(conversationId));
    opened.onmessage = (event) => latest.current(event.data as ShowMessage);
    channel.current = opened;
    return () => {
      opened.close();
      channel.current = null;
    };
  }, [conversationId]);
  return (message) => channel.current?.postMessage(message);
}

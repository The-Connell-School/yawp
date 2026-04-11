type FetcherState = 'idle' | 'submitting' | 'loading';

type MessageLike = { agent: string; content: string };

// Returns true when the optimistic user bubble should be hidden because
// the real user message has arrived in cms.messages AND we are in the
// post-submit revalidation window. Gating on state === 'loading' is
// what lets a student rapidly send the same text twice: during the
// second 'submitting' phase, we must KEEP showing the optimistic
// bubble even though an identical prior message already sits in
// history.
export const shouldSuppressOptimisticBubble = ({
  fetcherState,
  optimisticContent,
  messages,
}: {
  fetcherState: FetcherState;
  optimisticContent: unknown;
  messages: readonly MessageLike[];
}): boolean => {
  if (fetcherState !== 'loading') return false;
  if (typeof optimisticContent !== 'string') return false;
  return messages.some(
    (m) => m.agent === 'user' && m.content === optimisticContent
  );
};

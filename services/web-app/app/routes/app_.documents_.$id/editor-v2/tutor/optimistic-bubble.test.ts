import { describe, it, expect } from 'bun:test';
import { shouldSuppressOptimisticBubble } from './optimistic-bubble';

const userMsg = (content: string) => ({ agent: 'user', content });
const tutorMsg = (content: string) => ({ agent: 'assistant', content });

describe('shouldSuppressOptimisticBubble', () => {
  it('never suppresses when there is no optimistic content', () => {
    expect(
      shouldSuppressOptimisticBubble({
        fetcherState: 'loading',
        optimisticContent: undefined,
        messages: [userMsg('hi')],
      })
    ).toBe(false);
  });

  it('never suppresses while submitting (in-flight)', () => {
    expect(
      shouldSuppressOptimisticBubble({
        fetcherState: 'submitting',
        optimisticContent: 'ok',
        messages: [],
      })
    ).toBe(false);
  });

  it('keeps the optimistic bubble on a double-send while the second submit is in flight', () => {
    // Student just sent "ok", it landed in messages, they send "ok" again.
    // Second submission is in 'submitting' state — we MUST keep rendering
    // the optimistic bubble for the second send even though an identical
    // prior message already sits in cms.messages.
    expect(
      shouldSuppressOptimisticBubble({
        fetcherState: 'submitting',
        optimisticContent: 'ok',
        messages: [userMsg('ok'), tutorMsg('got it')],
      })
    ).toBe(false);
  });

  it('suppresses during the revalidation window once the real message has landed', () => {
    expect(
      shouldSuppressOptimisticBubble({
        fetcherState: 'loading',
        optimisticContent: 'hello world',
        messages: [userMsg('hello world'), tutorMsg('hi back')],
      })
    ).toBe(true);
  });

  it('does not suppress during the revalidation window if no matching user message exists yet', () => {
    expect(
      shouldSuppressOptimisticBubble({
        fetcherState: 'loading',
        optimisticContent: 'hello world',
        messages: [userMsg('earlier turn'), tutorMsg('earlier reply')],
      })
    ).toBe(false);
  });

  it('does not confuse a tutor message with the same text as the student submission', () => {
    expect(
      shouldSuppressOptimisticBubble({
        fetcherState: 'loading',
        optimisticContent: 'yes',
        messages: [tutorMsg('yes')],
      })
    ).toBe(false);
  });

  it('ignores non-string optimistic content (e.g. a File)', () => {
    expect(
      shouldSuppressOptimisticBubble({
        fetcherState: 'loading',
        optimisticContent: new Blob(['ok']),
        messages: [userMsg('ok')],
      })
    ).toBe(false);
  });
});

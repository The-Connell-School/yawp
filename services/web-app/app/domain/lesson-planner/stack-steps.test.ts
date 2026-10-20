import { describe, expect, test } from 'bun:test';
import { buildLessonPacket } from './lesson-packet';
import { stackSteps } from './stack-steps';
import { stackTiming } from './stack-timing';

describe('stackSteps: the run of show (stack page redesign)', () => {
  const packet = buildLessonPacket({
    title: 'Day One',
    className: null,
    sections: [
      { id: 'cs', origin: 'material', kind: 'handout', keptAudience: 'student', keptTitle: 'Class Starter: Four minutes of writing (5 min)', content: 'What do you carry?' },
      { id: 'hook', origin: 'material', kind: 'plan', keptAudience: 'teacher', keptTitle: 'Hook activity: What’s in your bag? (15 min)', content: 'Give students 2 minutes to lay out their bags. Pairs share.' },
      { id: 'deck', origin: 'material', kind: 'slides', keptAudience: 'teacher', keptTitle: 'Day One deck', content: '```yawp-slides\n{"title":"x","slides":[{"layout":"title","title":"x","speakerNotes":"x","minutes":1}]}\n```' },
      { id: 'hist', origin: 'material', kind: 'plan', keptAudience: 'teacher', keptTitle: 'Frame — Historical context', content: 'Vietnam.', minutes: 4 },
    ],
  });
  const steps = stackSteps({
    packet,
    materialKinds: { cs: 'class-starter', hook: 'step', deck: 'slides', hist: 'notes' },
    materialMeta: {
      hook: { stepType: 'activity', label: null, minutes: 15, hasHandout: null, yawpAssignmentId: null, yawpCreated: false },
      hist: { stepType: 'context', label: null, minutes: 4, hasHandout: null, yawpAssignmentId: null, yawpCreated: false },
    },
    materialTokens: {},
    stackDetails: {},
  });

  test('the deck is built from the stack, not a step of it', () => {
    expect(steps.map((step) => step.id)).toEqual(['cs', 'hook', 'hist']);
  });

  test('each step has its type, minutes, writing and title without the minutes', () => {
    expect(steps[0]).toMatchObject({ type: 'class_starter', minutes: 5, isWriting: true, hasHandout: true, key: 'm:cs' });
    expect(steps[1]).toMatchObject({ type: 'activity', minutes: 15, isWriting: false, title: 'Hook activity: What’s in your bag?' });
    expect(steps[2]).toMatchObject({ type: 'context', minutes: 4, hasHandout: false });
  });

  test('the header total is the sum of the steps', () => {
    expect(stackTiming(steps, 50).total).toBe(24);
  });
});

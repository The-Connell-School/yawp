import { describe, expect, test } from 'bun:test';
import { buildLessonPacket } from './lesson-packet';
import { notYetInYawp, stackSteps, withWritingCall, writingCallFor } from './stack-steps';
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

describe('notYetInYawp: what still has to be made in Yawp! before class', () => {
  const step = (id: string, create: { created?: boolean } | null) => ({
    id,
    create: create ? { label: 'Create', href: '/x', ...create } : null,
  });

  test('writing steps with a Create link that has not been used, in order', () => {
    const steps = [step('starter', { created: true }), step('lecture', null), step('ticket', {}), step('daily', { created: false })];
    expect(notYetInYawp(steps).map((s) => s.id)).toEqual(['ticket', 'daily']);
  });

  test('leaves out what the teacher is doing on paper', () => {
    expect(notYetInYawp([step('ticket', {}), step('daily', {})], new Set(['ticket'])).map((s) => s.id)).toEqual(['daily']);
  });
});

describe("the teacher's call on writing (Nov 4 follow-up)", () => {
  // A quick write reads as writing by the rule: the teacher can say it isn't
  // (they will talk it through instead), and say it back.
  const packet = buildLessonPacket({
    title: 'Pre-writing',
    className: null,
    sections: [
      { id: 'pre', origin: 'material', kind: 'plan', keptAudience: 'teacher', keptTitle: 'Quick write: the four moves (10 min)', content: 'Quick write: which of brainstorming, listing, mapping and freewriting would you reach for first, and why?' },
      { id: 'hook', origin: 'material', kind: 'plan', keptAudience: 'teacher', keptTitle: 'Hook activity: What’s in your bag? (15 min)', content: 'Pairs share.' },
    ],
  });
  const meta = (writing: boolean | null) => ({
    stepType: null,
    label: null,
    minutes: null,
    hasHandout: null,
    yawpAssignmentId: null,
    yawpCreated: false,
    writing,
  });
  const create = { create: { label: 'Create this quick write in Yawp!', href: '/x' } };
  const steps = (pre: boolean | null, hook: boolean | null = null) =>
    stackSteps({
      packet,
      materialKinds: { pre: 'step', hook: 'step' },
      materialMeta: { pre: meta(pre), hook: meta(hook) },
      materialTokens: {},
      stackDetails: { pre: create },
    });

  test('left alone, the rule decides, and says it did', () => {
    const [pre, hook] = steps(null);
    expect(pre).toMatchObject({ isWriting: true, writingAuto: true, writingByTeacher: false });
    expect(pre!.create).not.toBeNull();
    expect(hook).toMatchObject({ isWriting: false, writingAuto: false, writingByTeacher: false });
  });

  test('marked not writing: no badge, no minutes in the meter, no Create link', () => {
    const [pre] = steps(false);
    expect(pre).toMatchObject({ isWriting: false, writingAuto: true, writingByTeacher: true, writingName: undefined });
    expect(pre!.create).toBeNull();
    expect(stackTiming(steps(false), 50).writingMinutes).toBe(0);
    expect(stackTiming(steps(null), 50).writingMinutes).toBe(10);
  });

  test('marked writing: counts, though the rule said no', () => {
    const [, hook] = steps(null, true);
    expect(hook).toMatchObject({ isWriting: true, writingAuto: false, writingByTeacher: true });
    expect(hook!.writingName).toBeTruthy();
    expect(stackTiming(steps(null, true), 50).writingMinutes).toBe(25);
  });

  test('an assignment already made keeps its "Assignment created", whatever the call', () => {
    const [pre] = stackSteps({
      packet,
      materialKinds: { pre: 'step', hook: 'step' },
      materialMeta: { pre: meta(false) },
      materialTokens: {},
      stackDetails: { pre: { create: { label: 'Assignment created', href: '/a', created: true } } },
    });
    expect(pre!.create?.created).toBe(true);
  });

  test('a lesson from before the override (no writing field) reads as before', () => {
    const { writing: _writing, ...old } = meta(null);
    const [pre] = stackSteps({
      packet,
      materialKinds: { pre: 'step' },
      materialMeta: { pre: old },
      materialTokens: {},
      stackDetails: {},
    });
    expect(pre).toMatchObject({ isWriting: true, writingByTeacher: false });
  });
});

describe('withWritingCall and writingCallFor: the page shows the call at once', () => {
  const packet = buildLessonPacket({
    title: 'Pre-writing',
    className: null,
    sections: [
      { id: 'pre', origin: 'material', kind: 'plan', keptAudience: 'teacher', keptTitle: 'Quick write: the four moves (10 min)', content: 'Quick write: which move would you reach for first?' },
    ],
  });
  const [pre] = stackSteps({
    packet,
    materialKinds: { pre: 'step' },
    materialMeta: {},
    materialTokens: {},
    stackDetails: { pre: { create: { label: 'Create this quick write in Yawp!', href: '/x' } } },
  });

  test('a call applies the same rule as the server', () => {
    const off = withWritingCall(pre!, false);
    expect(off).toMatchObject({ isWriting: false, writingByTeacher: true, writingName: undefined, create: null });
    const back = withWritingCall(off, null);
    expect(back).toMatchObject({ isWriting: true, writingByTeacher: false });
    expect(back.writingName).toBeTruthy();
  });

  test("toggling back to the rule's own answer clears the call", () => {
    expect(writingCallFor(pre!, false)).toBe(false);
    expect(writingCallFor(pre!, true)).toBeNull();
    expect(writingCallFor({ writingAuto: false }, true)).toBe(true);
    expect(writingCallFor({ writingAuto: false }, false)).toBeNull();
  });
});

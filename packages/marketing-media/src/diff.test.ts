import { describe, expect, test } from 'bun:test';
import { diffStoryboards } from './diff';
import { parseStoryboard } from './storyboard';

const BASE = parseStoryboard({
  slug: 'teacher-loop',
  title: 'The teacher loop',
  persona: 'teacher',
  viewport: 'desktop',
  scenes: [
    { id: 'dashboard', goto: '/app', waitFor: 'main', hold: 2 },
    {
      id: 'student-work',
      goto: '/app/student-work',
      waitFor: 'main',
      hold: 2,
      steps: [{ action: 'waitFor', text: 'Needs Grading' }],
    },
  ],
});

function withScenes(scenes: unknown[]) {
  return parseStoryboard({
    slug: 'teacher-loop',
    title: 'The teacher loop',
    persona: 'teacher',
    viewport: 'desktop',
    scenes,
  });
}

describe('diffStoryboards', () => {
  test('finds nothing between a storyboard and itself', () => {
    expect(diffStoryboards(BASE, BASE)).toEqual([]);
  });

  // The no-op case the revise flow has to catch: a model that echoes the
  // storyboard back produces a "new take" identical to the one being
  // criticized, which is exactly what "it ignored my feedback" looks like.
  test('finds nothing between two separately parsed but equal storyboards', () => {
    expect(
      diffStoryboards(BASE, parseStoryboard(JSON.parse(JSON.stringify(BASE))))
    ).toEqual([]);
  });

  test('reports a changed hold on the scene it belongs to', () => {
    const after = withScenes([
      { id: 'dashboard', goto: '/app', waitFor: 'main', hold: 2 },
      {
        id: 'student-work',
        goto: '/app/student-work',
        waitFor: 'main',
        hold: 5,
        steps: [{ action: 'waitFor', text: 'Needs Grading' }],
      },
    ]);

    expect(diffStoryboards(BASE, after)).toEqual([
      { scene: 'student-work', field: 'hold', before: '2', after: '5' },
    ]);
  });

  test('reports an added and a removed scene', () => {
    const after = withScenes([
      { id: 'dashboard', goto: '/app', waitFor: 'main', hold: 2 },
      { id: 'my-classes', goto: '/app/my-classes', waitFor: 'main', hold: 2 },
    ]);

    const changes = diffStoryboards(BASE, after);

    expect(changes).toContainEqual({
      scene: 'student-work',
      field: 'scene',
      before: 'present',
      after: 'removed',
    });
    expect(changes).toContainEqual({
      scene: 'my-classes',
      field: 'scene',
      before: 'absent',
      after: 'added',
    });
  });

  // The operator's feedback is usually about pacing, so a steps change has to
  // say what the steps now do — "5 steps" would not tell them whether the
  // scroll they asked for is in there.
  test('describes what the steps do, not just how many', () => {
    const after = withScenes([
      { id: 'dashboard', goto: '/app', waitFor: 'main', hold: 2 },
      {
        id: 'student-work',
        goto: '/app/student-work',
        waitFor: 'main',
        hold: 2,
        steps: [
          { action: 'waitFor', text: 'Needs Grading' },
          { action: 'scroll', y: 520, seconds: 3.5 },
        ],
      },
    ]);

    const [change] = diffStoryboards(BASE, after);

    expect(change.scene).toBe('student-work');
    expect(change.field).toBe('steps');
    expect(change.before).toBe('waitFor “Needs Grading”');
    expect(change.after).toContain('scroll 520px over 3.5s');
  });

  // Same actions in the same order, different numbers: the pacing edit an
  // operator most often asks for. A count-based comparison would miss it.
  test('catches an edit that changes a step in place', () => {
    const before = withScenes([
      {
        id: 'dashboard',
        goto: '/app',
        waitFor: 'main',
        steps: [{ action: 'scroll', y: 300, seconds: 1 }],
      },
    ]);
    const after = withScenes([
      {
        id: 'dashboard',
        goto: '/app',
        waitFor: 'main',
        steps: [{ action: 'scroll', y: 600, seconds: 4 }],
      },
    ]);

    expect(diffStoryboards(before, after)).toEqual([
      {
        scene: 'dashboard',
        field: 'steps',
        before: 'scroll 300px over 1s',
        after: 'scroll 600px over 4s',
      },
    ]);
  });

  test('reports a changed overlay and a dropped focus', () => {
    const before = withScenes([
      {
        id: 'dashboard',
        goto: '/app',
        waitFor: 'main',
        overlay: 'Every course, one tap away',
        focus: { text: 'Daily Pages', scale: 1.5 },
      },
    ]);
    const after = withScenes([
      {
        id: 'dashboard',
        goto: '/app',
        waitFor: 'main',
        overlay: 'Assign daily writing in seconds',
      },
    ]);

    const changes = diffStoryboards(before, after);

    expect(changes).toContainEqual({
      scene: 'dashboard',
      field: 'overlay',
      before: 'Every course, one tap away',
      after: 'Assign daily writing in seconds',
    });
    expect(changes).toContainEqual({
      scene: 'dashboard',
      field: 'focus',
      before: 'text “Daily Pages” at 1.5×',
      after: 'none',
    });
  });

  test('reports a top-level change against the storyboard itself', () => {
    const after = parseStoryboard({
      ...JSON.parse(JSON.stringify(BASE)),
      title: 'Every writer, one pipeline',
      viewport: 'laptop',
    });

    const changes = diffStoryboards(BASE, after);

    expect(changes).toContainEqual({
      scene: null,
      field: 'title',
      before: 'The teacher loop',
      after: 'Every writer, one pipeline',
    });
    expect(changes).toContainEqual({
      scene: null,
      field: 'viewport',
      before: '1440×900',
      after: '1280×800',
    });
  });

  // Storyboards come back out of a Json column, so the diff has to cope with
  // whatever shape is stored rather than assuming a parsed object.
  test('survives input that is not a storyboard', () => {
    expect(diffStoryboards(null, BASE)).toEqual([]);
    expect(diffStoryboards(BASE, 'nonsense')).toEqual([]);
  });
});

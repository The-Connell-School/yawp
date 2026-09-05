import { describe, expect, test } from 'bun:test';
import { describePlan } from './plan';
import { parseStoryboard } from './storyboard';

const storyboard = parseStoryboard({
  slug: 'feedback-loop',
  title: 'Feedback students actually see',
  goal: 'Show a student reading rubric feedback on their own essay',
  persona: 'student-graded',
  backdrop: 'gradient',
  scenes: [
    {
      id: 'my-documents',
      goto: '/app/my-documents',
      waitFor: 'main',
      overlay: 'Every piece of writing, one place',
      hold: 0.8,
      screenshot: false,
      steps: [
        { action: 'waitFor', text: 'Graded civic essay' },
        { action: 'click', text: 'Graded civic essay' },
      ],
    },
    {
      id: 'graded',
      overlay: 'Feedback students actually read',
      focus: { text: 'Overall Feedback', scale: 1.6 },
      hold: 2,
      screenshot: true,
      steps: [{ action: 'scroll', y: 350, seconds: 3 }],
    },
  ],
});

describe('describePlan', () => {
  // The operator reads this instead of watching a render to find out what the
  // model understood. It has to say who, where, what happens, and what the
  // audience will read — in the operator's language, not the schema's.
  test('leads with what the model thinks it was asked for', () => {
    const plan = describePlan(storyboard);
    expect(plan.goal).toBe(
      'Show a student reading rubric feedback on their own essay'
    );
    expect(plan.persona).toBe('a student with a graded essay');
  });

  test('names the screen each scene opens on', () => {
    const [first, second] = describePlan(storyboard).scenes;
    expect(first.where).toBe('My Documents');
    // No goto: the click in the previous scene already navigated.
    expect(second.where).toBe('stays where the last scene ended');
  });

  test('turns steps into things a person did', () => {
    const [first, second] = describePlan(storyboard).scenes;
    expect(first.actions).toEqual(['clicks “Graded civic essay”']);
    expect(second.actions).toEqual(['scrolls down the page over 3s']);
  });

  test('surfaces the on-screen copy and the push-in', () => {
    const [, second] = describePlan(storyboard).scenes;
    expect(second.overlay).toBe('Feedback students actually read');
    expect(second.emphasis).toBe('pushes in on “Overall Feedback”');
  });

  test('reports how long the whole thing runs', () => {
    expect(describePlan(storyboard).estimatedSeconds).toBeGreaterThan(0);
  });

  // A plan that hides an unaimed scene is how a boring take gets approved.
  test('says plainly when a scene just holds', () => {
    const still = parseStoryboard({
      slug: 'reporter-hold',
      title: 'Reporter hold',
      scenes: [{ id: 'only', goto: '/app/reporter', waitFor: 'main' }],
    });
    const [scene] = describePlan(still).scenes;
    expect(scene.where).toBe('Yawp Reporter');
    expect(scene.actions).toEqual([]);
    expect(scene.emphasis).toBeUndefined();
  });
});

describe('naming targets the way an operator would', () => {
  // The plan is read instead of the JSON, so a raw CSS selector in it defeats
  // the purpose. The selectors storyboards actually use get real names.
  test('names the surfaces behind the common selectors', () => {
    const typed = parseStoryboard({
      slug: 'reporter-ask',
      title: 'Reporter ask',
      scenes: [
        {
          id: 'ask',
          goto: '/app/reporter',
          waitFor: 'main',
          steps: [
            { action: 'type', selector: 'textarea', value: 'Who needs help?' },
          ],
        },
        {
          id: 'draft',
          goto: '/app/my-documents',
          waitFor: 'main',
          steps: [{ action: 'click', selector: '.ProseMirror' }],
        },
      ],
    });
    const [ask, draft] = describePlan(typed).scenes;
    expect(ask.actions[0]).toBe('types “Who needs help?” into the question box');
    expect(draft.actions[0]).toBe('clicks the writing editor');
  });
});

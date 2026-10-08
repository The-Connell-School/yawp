import {
  safeParseStoryboard,
  type MarketingStoryboard,
  type StoryboardScene,
  type StoryboardStep,
} from './storyboard';

/**
 * What changed between two takes of the same storyboard.
 *
 * The refine flow asks a model to edit a storyboard from an operator's notes,
 * and until this existed there was no way to answer the only question the
 * operator actually has — "did it do what I asked?" — short of reading two
 * JSON blobs side by side. A revision that changed nothing and a revision that
 * changed the wrong thing looked identical from the job page.
 *
 * It doubles as the no-op detector: an empty diff means the model handed back
 * the storyboard it was given.
 */
export type StoryboardChange = {
  /** Scene id, or null for a change to the storyboard itself. */
  scene: string | null;
  field: string;
  before: string;
  after: string;
};

/** Scene fields worth reporting, in the order an operator reads a scene. */
const SCENE_FIELDS = [
  'goto',
  'waitFor',
  'settle',
  'hold',
  'overlay',
  'caption',
  'screenshot',
  'fullPage',
  'startsClip',
] as const;

const STORYBOARD_FIELDS = ['slug', 'title', 'audience', 'goal', 'persona'] as const;

/**
 * One step in the words an operator uses about it.
 *
 * Pacing is what feedback is usually about, so the numbers are part of the
 * description: "scroll 520px over 3.5s" tells them the scroll they asked for
 * landed, where "scroll" alone would not.
 */
function describeStep(step: StoryboardStep): string {
  const target = () => {
    const aimed = step as { selector?: string; role?: string; name?: string; text?: string };
    if (aimed.selector) return ` ${aimed.selector}`;
    if (aimed.role) return ` ${aimed.role}${aimed.name ? ` “${aimed.name}”` : ''}`;
    if (aimed.text) return ` “${aimed.text}”`;
    return '';
  };

  switch (step.action) {
    case 'scroll':
      return step.seconds > 0
        ? `scroll ${step.y}px over ${step.seconds}s`
        : `scroll ${step.y}px`;
    case 'wait':
      return `wait ${step.seconds}s`;
    case 'type':
    case 'fill':
      return `${step.action}${target()} “${step.value}”`;
    case 'press':
      return `press ${step.key}`;
    case 'screenshot':
      return `screenshot ${step.name}`;
    case 'goto':
      return `goto ${step.path}`;
    case 'login':
      return `login as ${step.persona}`;
    default:
      return `${step.action}${target()}`;
  }
}

function describeSteps(steps: StoryboardStep[]): string {
  return steps.length === 0 ? 'none' : steps.map(describeStep).join(', ');
}

function describeFocus(focus: StoryboardScene['focus']): string {
  if (!focus) return 'none';
  const aim = focus.selector
    ? focus.selector
    : focus.role
      ? `${focus.role}${focus.name ? ` “${focus.name}”` : ''}`
      : focus.text
        ? `text “${focus.text}”`
        : 'unaimed';
  return `${aim} at ${focus.scale}×`;
}

function describe(value: unknown): string {
  if (value === undefined || value === null) return 'none';
  return String(value);
}

/**
 * Compare two storyboards field by field.
 *
 * Scenes are matched by id rather than position, so inserting a scene reads as
 * one addition instead of renumbering every scene after it. A model that
 * renames an id produces a removal plus an addition, which is the honest
 * reading — nothing here can tell a rename from a replacement.
 *
 * Anything that does not parse as a storyboard yields no changes: this feeds a
 * display and a no-op check, and neither is worth throwing over.
 */
export function diffStoryboards(
  beforeInput: unknown,
  afterInput: unknown
): StoryboardChange[] {
  const before = safeParseStoryboard(beforeInput);
  const after = safeParseStoryboard(afterInput);
  if (!before.success || !after.success) return [];

  const changes: StoryboardChange[] = [];
  const push = (
    scene: string | null,
    field: string,
    from: unknown,
    to: unknown
  ) => {
    if (describe(from) === describe(to)) return;
    changes.push({
      scene,
      field,
      before: describe(from),
      after: describe(to),
    });
  };

  for (const field of STORYBOARD_FIELDS) {
    push(null, field, before.data[field], after.data[field]);
  }

  const viewport = (storyboard: MarketingStoryboard) =>
    `${storyboard.viewport.width}×${storyboard.viewport.height}`;
  push(null, 'viewport', viewport(before.data), viewport(after.data));

  const beforeScenes = new Map(
    before.data.scenes.map((scene) => [scene.id, scene])
  );
  const afterScenes = new Map(
    after.data.scenes.map((scene) => [scene.id, scene])
  );

  for (const scene of before.data.scenes) {
    if (!afterScenes.has(scene.id)) {
      changes.push({
        scene: scene.id,
        field: 'scene',
        before: 'present',
        after: 'removed',
      });
    }
  }

  for (const scene of after.data.scenes) {
    const previous = beforeScenes.get(scene.id);
    if (!previous) {
      changes.push({
        scene: scene.id,
        field: 'scene',
        before: 'absent',
        after: 'added',
      });
      continue;
    }

    for (const field of SCENE_FIELDS) {
      push(scene.id, field, previous[field], scene[field]);
    }
    push(
      scene.id,
      'steps',
      describeSteps(previous.steps),
      describeSteps(scene.steps)
    );
    push(
      scene.id,
      'focus',
      describeFocus(previous.focus),
      describeFocus(scene.focus)
    );
  }

  return changes;
}

import { ROUTE_GUIDE } from './route-guide';
import {
  estimateRenderSeconds,
  type AllowedRoute,
  type MarketingPersona,
  type MarketingStoryboard,
  type StoryboardScene,
} from './storyboard';

/**
 * A storyboard in the operator's language, so a misread brief is caught before
 * anything is filmed rather than after.
 *
 * The storyboard itself is the contract with the renderer and reads like one.
 * An operator asked to approve JSON either skims it or approves it blind; both
 * end with a wrong take and a two-minute wait to discover it. This says who is
 * on screen, where they are, what they do, and what the audience reads.
 */
export type PlanScene = {
  id: string;
  /** The screen this scene opens on, named the way the app names it. */
  where: string;
  /** What a person watching would say happened, in order. */
  actions: string[];
  /** The line burned onto the clip while this scene plays. */
  overlay?: string;
  /** The push-in, when the scene has one. */
  emphasis?: string;
  /** Seconds the scene lingers on its final state. */
  holdSeconds: number;
  capturesStill: boolean;
};

export type StoryboardPlan = {
  title: string;
  /** The model's own statement of what it understood the brief to want. */
  goal?: string;
  persona: string;
  scenes: PlanScene[];
  estimatedSeconds: number;
};

/** How each screen is named in the product, for the "where" line. */
const ROUTE_NAMES: Record<AllowedRoute, string> = {
  '/': 'the public landing page',
  '/info': 'the public “learn more” page',
  '/accessibility': 'the accessibility statement',
  '/app': 'the dashboard',
  '/app/my-classes': 'My Classes',
  '/app/my-documents': 'My Documents',
  '/app/assignments': 'My Assignments',
  '/app/documents': 'Documents (the grading hub)',
  '/app/reporter': 'Yawp Reporter',
  '/app/student-work': 'Documents (the grading hub)',
  '/app/teacher-trainings': 'Teacher’s Lounge',
};

const PERSONA_NAMES: Record<MarketingPersona, string> = {
  teacher: 'a teacher',
  'teacher-multi': 'a teacher with several classes',
  student: 'a student mid-draft',
  'student-submitted': 'a student who has submitted work',
  'student-graded': 'a student with a graded essay',
};

/**
 * The selectors storyboards actually use, in the operator's words. A plan that
 * still contains a CSS selector has not finished translating.
 */
const SELECTOR_NAMES: Record<string, string> = {
  '.ProseMirror': 'the writing editor',
  textarea: 'the question box',
  main: 'the page',
};

/** What a step aims at, quoted the way the operator would say it. */
function describeTarget(step: Record<string, unknown>): string {
  if (typeof step.name === 'string' && step.name) return `“${step.name}”`;
  if (typeof step.text === 'string' && step.text) return `“${step.text}”`;
  if (typeof step.selector === 'string' && step.selector) {
    return SELECTOR_NAMES[step.selector] ?? `\`${step.selector}\``;
  }
  return 'the page';
}

/**
 * One human sentence per step, skipping the ones that are stagecraft rather
 * than action — a waitFor is how the renderer stays in sync, not something a
 * viewer sees happen.
 */
function describeStep(step: StoryboardScene['steps'][number]): string | null {
  const fields = step as unknown as Record<string, unknown>;
  switch (step.action) {
    case 'click':
      return `clicks ${describeTarget(fields)}`;
    case 'hover':
      return `hovers ${describeTarget(fields)}`;
    case 'scrollTo':
      return `scrolls to ${describeTarget(fields)}`;
    case 'fill':
    case 'type':
      return `types “${String(fields.value ?? '')}” into ${describeTarget(fields)}`;
    case 'press':
      return `presses ${String(fields.key ?? '')}`;
    case 'scroll': {
      const seconds = Number(fields.seconds ?? 0);
      const direction = Number(fields.y ?? 0) < 0 ? 'up' : 'down';
      return seconds > 0
        ? `scrolls ${direction} the page over ${seconds}s`
        : `scrolls ${direction} the page`;
    }
    case 'screenshot':
      return 'takes a still';
    case 'goto':
      return `goes to ${ROUTE_NAMES[fields.path as AllowedRoute] ?? String(fields.path)}`;
    case 'login':
      return `switches to ${PERSONA_NAMES[fields.persona as MarketingPersona] ?? String(fields.persona)}`;
    // Waiting is how the render stays in step with the page, not an action.
    case 'wait':
    case 'waitFor':
      return null;
    default:
      return null;
  }
}

function describeEmphasis(scene: StoryboardScene): string | undefined {
  const focus = scene.focus as Record<string, unknown> | undefined;
  if (!focus) return undefined;
  return `pushes in on ${describeTarget(focus)}`;
}

export function describePlan(storyboard: MarketingStoryboard): StoryboardPlan {
  return {
    title: storyboard.title,
    goal: storyboard.goal,
    persona: PERSONA_NAMES[storyboard.persona] ?? storyboard.persona,
    estimatedSeconds: estimateRenderSeconds(storyboard),
    scenes: storyboard.scenes.map((scene) => ({
      id: scene.id,
      where: scene.goto
        ? (ROUTE_NAMES[scene.goto as AllowedRoute] ?? scene.goto)
        : 'stays where the last scene ended',
      actions: (scene.steps ?? [])
        .map(describeStep)
        .filter((line): line is string => line !== null),
      overlay: scene.overlay,
      emphasis: describeEmphasis(scene),
      holdSeconds: scene.hold,
      capturesStill: scene.screenshot,
    })),
  };
}

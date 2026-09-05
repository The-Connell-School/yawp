import { z } from 'zod';

/**
 * The storyboard is the contract between the LLM that writes a marketing demo
 * and the renderer that films it. The renderer never takes free-form
 * instructions: it executes a storyboard that passed this schema, so an
 * unexpected model output fails validation instead of driving a browser.
 *
 * Every constraint here exists to bound one of three things: where the browser
 * can go, what it can do when it gets there, and how long it can take.
 */

/**
 * Routes a storyboard may navigate to directly. Detail pages (a class, a
 * document, a submission) are reached by clicking a link, which keeps the
 * renderer inside whatever tenant it is signed into rather than letting a
 * generated URL address a record by id.
 *
 * Admin surfaces are deliberately absent. They are not marketing material and
 * they expose org-wide data.
 */
export const ALLOWED_ROUTES = [
  '/',
  '/info',
  '/accessibility',
  '/app',
  '/app/my-classes',
  '/app/my-documents',
  '/app/assignments',
  '/app/documents',
  '/app/reporter',
  // Legacy: redirects to /app/documents. Kept so storyboards written against
  // the old path still validate; the guide sends new ones to the new one.
  '/app/student-work',
  '/app/teacher-trainings',
] as const;

export type AllowedRoute = (typeof ALLOWED_ROUTES)[number];

/**
 * Seeded demo personas that may appear in marketing media. Admin and org-owner
 * personas are excluded because their screens are not marketing surfaces, and
 * `student-unreleased` is excluded because an unreleased grade reads as a bug
 * to anyone who does not know the submission model.
 */
export const MARKETING_PERSONAS = [
  'teacher',
  'teacher-multi',
  'student',
  'student-submitted',
  'student-graded',
] as const;

export type MarketingPersona = (typeof MARKETING_PERSONAS)[number];

/**
 * What a framed still or clip is presented on. The gradient is the default
 * because it is what a product clip in a feed looks like; the quieter ones
 * exist because a slide deck, a doc, or a page with its own art does not want
 * a second loud thing on it, and 'none' hands back the bare capture.
 *
 * It lives on the storyboard rather than the job row so a revision or a
 * re-render films the same look without being told again.
 */
export const MARKETING_BACKDROPS = [
  'gradient',
  'slate',
  'paper',
  'none',
] as const;
export type MarketingBackdrop = (typeof MARKETING_BACKDROPS)[number];

export const MARKETING_BACKDROP_LABELS: Record<
  MarketingBackdrop,
  { label: string; detail: string }
> = {
  gradient: {
    label: 'Gradient',
    detail: 'Vivid colour wash. Made for a feed or a landing page.',
  },
  slate: {
    label: 'Slate',
    detail: 'Deep neutral. Sits quietly on a dark slide.',
  },
  paper: {
    label: 'Paper',
    detail: 'Warm off-white, the app\'s own. For docs and light decks.',
  },
  none: {
    label: 'None',
    detail: 'The bare capture, no window chrome. For embedding.',
  },
};

export const VIEWPORT_PRESETS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;

export type ViewportPreset = keyof typeof VIEWPORT_PRESETS;

/** Keys a storyboard may press. Anything that opens devtools or the browser UI is out. */
export const ALLOWED_KEYS = [
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageDown',
  'PageUp',
] as const;

export const MAX_SCENES = 12;
export const MAX_STEPS_PER_SCENE = 12;
export const MAX_TYPED_CHARACTERS = 1000;
export const MAX_WAIT_SECONDS = 30;
export const MAX_HOLD_SECONDS = 30;
/** Ceiling on a single render, so one storyboard cannot occupy the worker for an hour. */
export const MAX_RENDER_SECONDS = 180;

/** Rough per-scene cost of navigation and first paint, used for the budget estimate. */
const SCENE_NAVIGATION_SECONDS = 2;
const DEFAULT_SETTLE_SECONDS = 0.8;
const DEFAULT_HOLD_SECONDS = 1.5;
const TYPING_SECONDS_PER_CHARACTER = 0.045;

const slug = z
  .string()
  .min(3)
  .max(60)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'slug must be lowercase words separated by hyphens'
  );

const route = z
  .string()
  .refine(
    (value): value is AllowedRoute =>
      (ALLOWED_ROUTES as readonly string[]).includes(value),
    {
      message: `route must be one of: ${ALLOWED_ROUTES.join(', ')}`,
    }
  );

/**
 * Selectors reach Playwright, so keep them to things that look like selectors.
 * Markup and URL schemes are rejected outright rather than trusted to be inert.
 */
const selector = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => !/[<>]/.test(value), {
    message: 'selector must not contain markup',
  })
  .refine((value) => !/^\s*(javascript|data|vbscript):/i.test(value), {
    message: 'selector must not contain a url scheme',
  });

const humanText = z.string().min(1).max(120);

const targetFields = {
  selector: selector.optional(),
  role: z
    .enum([
      'link',
      'button',
      'heading',
      'tab',
      'textbox',
      'checkbox',
      'listitem',
      'row',
      // Dropdown menus render their items in a portal at the end of the
      // document, so matching them by text finds page copy first and the
      // click lands on something inert. Without this role a storyboard has
      // no way to name a menu item at all.
      'menuitem',
    ])
    .optional(),
  name: humanText.optional(),
  text: humanText.optional(),
  optional: z.boolean().optional(),
};

/** Actions that act on an element, and so need something to aim at. */
const TARGETED_ACTIONS = [
  'click',
  'hover',
  'scrollTo',
  'waitFor',
  'fill',
  'type',
] as const;

function hasTarget(step: { selector?: string; role?: string; text?: string }) {
  return Boolean(step.selector || step.role || step.text);
}

const clickStep = z.object({ action: z.literal('click'), ...targetFields });
const hoverStep = z.object({ action: z.literal('hover'), ...targetFields });
const scrollToStep = z.object({
  action: z.literal('scrollTo'),
  ...targetFields,
});
const waitForStep = z.object({ action: z.literal('waitFor'), ...targetFields });

const fillStep = z.object({
  action: z.literal('fill'),
  ...targetFields,
  value: z.string().max(MAX_TYPED_CHARACTERS),
});

const typeStep = z.object({
  action: z.literal('type'),
  ...targetFields,
  // `text` doubles as a locator, so typed content gets its own field.
  value: z.string().min(1).max(MAX_TYPED_CHARACTERS),
  at: z.enum(['caret', 'end']).default('end'),
});

const pressStep = z.object({
  action: z.literal('press'),
  key: z.enum(ALLOWED_KEYS),
  ...targetFields,
});

const scrollStep = z.object({
  action: z.literal('scroll'),
  y: z.number().int().min(-2000).max(2000).default(400),
  /**
   * Spread the scroll over this many seconds instead of jumping.
   *
   * A jump tells a viewer nothing: one frame the list is at the top, the next
   * it is somewhere else, and at feed size that reads as a cut. A paced scroll
   * is how a clip shows that a panel *has* more in it — which is the whole
   * claim a feature clip is making. Zero keeps the original instant behaviour,
   * so storyboards written before this still render exactly as they did.
   */
  seconds: z.number().min(0).max(MAX_WAIT_SECONDS).default(0),
});

const waitStep = z.object({
  action: z.literal('wait'),
  seconds: z.number().min(0.1).max(MAX_WAIT_SECONDS),
});

const screenshotStep = z.object({
  action: z.literal('screenshot'),
  name: slug,
  fullPage: z.boolean().default(false),
});

const gotoStep = z.object({
  action: z.literal('goto'),
  path: route,
});

const loginStep = z.object({
  action: z.literal('login'),
  persona: z.enum(MARKETING_PERSONAS),
  path: route.default('/app'),
});

export const StoryboardStepSchema = z.discriminatedUnion('action', [
  clickStep,
  hoverStep,
  scrollToStep,
  waitForStep,
  fillStep,
  typeStep,
  pressStep,
  scrollStep,
  waitStep,
  screenshotStep,
  gotoStep,
  loginStep,
]);

export type StoryboardStep = z.infer<typeof StoryboardStepSchema>;

export const StoryboardSceneSchema = z
  .object({
    id: slug,
    goto: route.optional(),
    waitFor: selector.optional(),
    settle: z.number().min(0).max(10).default(DEFAULT_SETTLE_SECONDS),
    steps: z.array(StoryboardStepSchema).max(MAX_STEPS_PER_SCENE).default([]),
    hold: z.number().min(0).max(MAX_HOLD_SECONDS).default(DEFAULT_HOLD_SECONDS),
    screenshot: z.boolean().default(true),
    fullPage: z.boolean().default(false),
    /** Shown next to the still in the admin gallery, not rendered on the page. */
    caption: z.string().max(200).optional(),
    /**
     * Burned into the clip while this scene plays. Deliberately separate from
     * `caption`: a caption describes the action for an admin reading the job
     * page ("Teacher clicks the Daily Pages card"), which reads like a test
     * log on screen. An overlay is the line an audience should read — short,
     * benefit-led, present tense. The cap enforces that; long copy is
     * unreadable at a glance in a feed anyway.
     */
    overlay: z.string().max(60).optional(),
    /**
     * Start the delivered clip at this scene. Everything before it is still
     * filmed — that is how the renderer reaches a detail page at all, by
     * clicking through from a list rather than addressing a record by id —
     * but the viewer never sees the walk there.
     *
     * This is what lets a clip open on a graded submission without letting a
     * generated storyboard navigate straight to one.
     */
    startsClip: z.boolean().default(false),
    /**
     * Push in on one element once the scene's steps are done. Product UI is
     * illegible when a 1280px viewport is scaled into a feed, and the whole
     * point of a feature clip is that a viewer can read the thing being
     * demonstrated.
     *
     * Measured during capture and animated during framing, so the capture
     * itself is never scaled — zooming the live page would reflow it and
     * move the targets the steps are aiming at.
     */
    focus: z
      .object({
        selector: selector.optional(),
        role: targetFields.role,
        name: humanText.optional(),
        text: humanText.optional(),
        /** 1 is untouched; much past 2 and the surrounding context is gone. */
        scale: z.number().min(1).max(2.5).default(1.5),
      })
      .refine((value) => hasTarget(value), {
        message: 'focus needs a selector, a role, or text to aim at',
      })
      .optional(),
  })
  .superRefine((scene, ctx) => {
    scene.steps.forEach((step, index) => {
      if (!(TARGETED_ACTIONS as readonly string[]).includes(step.action))
        return;
      if (
        hasTarget(step as { selector?: string; role?: string; text?: string })
      )
        return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps', index, 'selector'],
        message: `${step.action} needs a selector, a role, or text to act on`,
      });
    });
  });

export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;

const viewport = z
  .union([
    z.enum(['desktop', 'laptop', 'mobile']),
    z.object({ width: z.number().int(), height: z.number().int() }),
  ])
  .optional()
  .transform((value) => {
    if (!value) return VIEWPORT_PRESETS.desktop;
    if (typeof value === 'string') return VIEWPORT_PRESETS[value];
    return value;
  })
  .refine(
    (value) =>
      Object.values(VIEWPORT_PRESETS).some(
        (preset) =>
          preset.width === value.width && preset.height === value.height
      ),
    {
      message:
        'viewport must match one of the presets: desktop, laptop, mobile',
    }
  );

export const StoryboardSchema = z
  .object({
    slug,
    title: z.string().min(3).max(120),
    audience: z.string().max(200).optional(),
    goal: z.string().max(400).optional(),
    persona: z.enum(MARKETING_PERSONAS).default('teacher'),
    backdrop: z.enum(MARKETING_BACKDROPS).default('gradient'),
    viewport,
    scenes: z.array(StoryboardSceneSchema).min(1).max(MAX_SCENES),
  })
  .superRefine((value, ctx) => {
    const ids = value.scenes.map((scene) => scene.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes'],
        message: 'scene ids must be unique',
      });
    }

    const seconds = estimateRenderSeconds(value);
    if (seconds > MAX_RENDER_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes'],
        message: `storyboard would run about ${Math.round(seconds)}s, over the ${MAX_RENDER_SECONDS}s render cap`,
      });
    }
  });

export type MarketingStoryboard = z.infer<typeof StoryboardSchema>;

export function parseStoryboard(input: unknown): MarketingStoryboard {
  return StoryboardSchema.parse(input);
}

export function safeParseStoryboard(input: unknown) {
  const result = StoryboardSchema.safeParse(input);
  return result.success
    ? { success: true as const, data: result.data, error: undefined }
    : { success: false as const, data: undefined, error: result.error };
}

/** Human-readable reason a storyboard was rejected, for the admin UI and job error field. */
export function describeStoryboardError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'storyboard'}: ${issue.message}`)
    .join('; ');
}

/**
 * Wall-clock estimate for one render. Used as a validation cap and shown to the
 * admin before a job is queued, so nobody waits on a two-minute video wondering
 * whether the worker died.
 */
export function estimateRenderSeconds(
  storyboard: Pick<MarketingStoryboard, 'scenes'>
): number {
  let seconds = 0;

  for (const scene of storyboard.scenes) {
    if (scene.goto) seconds += SCENE_NAVIGATION_SECONDS;
    seconds += scene.settle ?? DEFAULT_SETTLE_SECONDS;
    seconds += scene.hold ?? DEFAULT_HOLD_SECONDS;

    for (const step of scene.steps ?? []) {
      switch (step.action) {
        case 'wait':
          seconds += step.seconds;
          break;
        case 'scroll':
          // A paced scroll occupies the clip for its whole duration; an
          // instant one costs about what any other step does.
          seconds += step.seconds > 0 ? step.seconds : 0.5;
          break;
        case 'type':
          seconds += step.value.length * TYPING_SECONDS_PER_CHARACTER;
          break;
        case 'goto':
        case 'login':
          seconds += SCENE_NAVIGATION_SECONDS;
          break;
        default:
          seconds += 0.5;
      }
    }
  }

  return Math.round(seconds * 10) / 10;
}

/** Stills a storyboard will produce, so the UI can promise a count up front. */
export function plannedShotCount(storyboard: MarketingStoryboard): number {
  return storyboard.scenes.reduce((total, scene) => {
    const extras = (scene.steps ?? []).filter(
      (step) => step.action === 'screenshot'
    ).length;
    return total + (scene.screenshot ? 1 : 0) + extras;
  }, 0);
}

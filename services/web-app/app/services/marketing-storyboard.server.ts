import {
  ALLOWED_KEYS,
  ALLOWED_ROUTES,
  MARKETING_PERSONAS,
  MAX_RENDER_SECONDS,
  MAX_SCENES,
  describeRoutesForPrompt,
  describeStoryboardError,
  estimateRenderSeconds,
  safeParseStoryboard,
  type MarketingJobKind,
  type MarketingStoryboard,
  type MarketingSubjectType,
} from '../../../../packages/marketing-media';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';

const STORYBOARD_MODEL = 'claude-sonnet-4-6';

/**
 * Clips are short-form marketing: one feature, one motion. The prompt asks for
 * 5-15 seconds; this is the hard ceiling a generated clip storyboard may
 * estimate before it is sent back for a shorter cut.
 */
export const MAX_CLIP_SECONDS = 20;

export class StoryboardGenerationError extends Error {
  constructor(
    message: string,
    readonly raw?: string
  ) {
    super(message);
    this.name = 'StoryboardGenerationError';
  }
}

export type GenerateStoryboardParams = {
  brief: string;
  kind: MarketingJobKind;
  audience?: string | null;
  subject?: { type: MarketingSubjectType; label: string } | null;
  model?: string;
};

export type GenerateStoryboardResult = {
  storyboard: MarketingStoryboard;
  model: string;
  raw: string;
};

function buildSystemPrompt(kind: MarketingJobKind): string {
  const shape =
    kind === 'CLIP'
      ? [
          'This storyboard becomes a short-form silent clip: 5 to 15 seconds of screen time showing ONE feature, and nothing else.',
          'One or two scenes. Start on the screen where the feature lives — no tour, no navigation montage.',
          'The clip is carried by the cursor: an enlarged cursor is rendered automatically, so write the steps as one legible motion — hover or click the feature, or open the thing and let it appear.',
          'Give the final state a hold of 1.5 to 2.5 seconds so it can land, and keep every wait short.',
          `Storyboards estimating over ${MAX_CLIP_SECONDS} seconds are rejected.`,
        ]
      : [
          'This storyboard becomes a set of still screenshots for a site, deck, or one-pager.',
          'Every scene should end on a screen worth photographing. Prefer fewer, better scenes.',
          'Keep holds short; stills do not need dwell time beyond letting the page settle.',
        ];

  return [
    'You write storyboards for YAWP! marketing media. YAWP! is a writing platform for middle school, high school, and college classrooms: students draft essays and get tutor feedback, teachers assign work, follow progress, and grade with rubrics.',
    '',
    'You are not writing prose. You return one JSON object matching the storyboard schema below, and nothing else.',
    '',
    ...shape,
    '',
    'Schema:',
    '{',
    '  "slug": "lowercase-hyphenated-name",',
    '  "title": "Short human title",',
    '  "audience": "Who this is for",',
    '  "goal": "What it should prove",',
    `  "persona": one of ${MARKETING_PERSONAS.join(' | ')},`,
    '  "viewport": "desktop" | "laptop" | "mobile",',
    '  "scenes": [',
    '    {',
    '      "id": "lowercase-hyphenated-scene-id",',
    `      "goto": one of ${ALLOWED_ROUTES.join(' | ')},`,
    '      "waitFor": "css selector that must be visible, usually main",',
    '      "steps": [ ... ],',
    '      "hold": seconds to linger,',
    '      "screenshot": true,',
    '      "caption": "what a viewer is looking at"',
    '    }',
    '  ]',
    '}',
    '',
    'Steps may be:',
    '  { "action": "click" | "hover" | "scrollTo" | "waitFor", target }',
    '  { "action": "fill" | "type", target, "value": "text" }',
    `  { "action": "press", "key": ${ALLOWED_KEYS.join(' | ')} }`,
    '  { "action": "scroll", "y": pixels }',
    '  { "action": "wait", "seconds": number }',
    '  { "action": "screenshot", "name": "lowercase-hyphenated" }',
    '  { "action": "goto", "path": allowed route }',
    `  { "action": "login", "persona": one of ${MARKETING_PERSONAS.join(' | ')} }`,
    '',
    'A target is one of: "selector" (css), "role" plus "name", or "text".',
    'Use "selector": ".ProseMirror" for the student writing editor.',
    'Mark a step "optional": true when it depends on seeded data that may not exist.',
    '',
    'What is on each page — the demo environment is seeded, and these elements and names are real:',
    describeRoutesForPrompt(),
    '',
    'Rules:',
    '- Never invent selectors, names, or text targets. Interact only with elements the page guide above names; any other interaction must be "optional": true.',
    '- The render starts already signed in as the storyboard "persona". Never add a login step for that same persona — use "login" only to switch to a different persona mid-story.',
    '- "goto" is optional on a scene. A scene with "goto" starts by navigating there, discarding whatever page the previous scene ended on. After a click that navigates, the next scene must OMIT "goto" to continue on the destination page.',
    `- Navigate only to the listed routes. Detail pages are reached by clicking a link, never by guessing a url.`,
    `- At most ${MAX_SCENES} scenes, and the whole storyboard must run in under ${MAX_RENDER_SECONDS} seconds.`,
    '- Use a "login" step to switch personas mid-storyboard, for example teacher to student.',
    '- Show the product doing real work. Do not stage empty states or loading screens.',
    '- Every scene must be something a prospective school would care about seeing.',
  ].join('\n');
}

function buildUserPrompt(params: GenerateStoryboardParams): string {
  const lines = [`Brief: ${params.brief.trim()}`];
  if (params.audience?.trim())
    lines.push(`Audience: ${params.audience.trim()}`);
  if (params.subject) {
    lines.push(`Subject: ${params.subject.label} (${params.subject.type})`);
  }
  lines.push(
    params.kind === 'CLIP'
      ? 'Deliverable: a short silent clip.'
      : 'Deliverable: a set of still screenshots.'
  );
  lines.push('Return only the storyboard JSON.');
  return lines.join('\n');
}

/** Models like to wrap JSON in prose or fences. Take the outermost object. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new StoryboardGenerationError(
      'The model did not return a storyboard object.',
      raw
    );
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new StoryboardGenerationError(
      `The model returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw
    );
  }
}

/**
 * Turn an admin's brief into a storyboard the renderer will accept.
 *
 * Validation failures are handed back to the model once, because the common
 * failure is a route or persona that does not exist rather than a
 * misunderstanding of the task. A second failure is reported to the admin with
 * the reasons, not retried forever.
 */
export async function generateStoryboard(
  params: GenerateStoryboardParams
): Promise<GenerateStoryboardResult> {
  return runStoryboardGeneration({
    kind: params.kind,
    model: params.model,
    initialUserMessage: buildUserPrompt(params),
  });
}

export type ReviseStoryboardParams = {
  brief: string;
  kind: MarketingJobKind;
  previousStoryboard: unknown;
  feedback: string;
  audience?: string | null;
  model?: string;
};

/**
 * Revise a rendered storyboard from operator feedback.
 *
 * A first take is rarely the final cut. The operator watches it and says what
 * to change; the model gets the storyboard that produced the take being
 * criticized and edits it, rather than re-imagining the brief from scratch —
 * everything that was right about the take survives the revision.
 */
export async function reviseStoryboard(
  params: ReviseStoryboardParams
): Promise<GenerateStoryboardResult> {
  const lines = [
    `Original brief: ${params.brief.trim()}`,
    ...(params.audience?.trim() ? [`Audience: ${params.audience.trim()}`] : []),
    '',
    'This storyboard was rendered, and the operator watched the result:',
    JSON.stringify(params.previousStoryboard),
    '',
    'Operator feedback on that take:',
    params.feedback.trim(),
    '',
    'Revise the storyboard to address the feedback. Keep what the feedback does not question. Return only the revised storyboard JSON.',
  ];
  return runStoryboardGeneration({
    kind: params.kind,
    model: params.model,
    initialUserMessage: lines.join('\n'),
  });
}

async function runStoryboardGeneration(params: {
  kind: MarketingJobKind;
  model?: string;
  initialUserMessage: string;
}): Promise<GenerateStoryboardResult> {
  const model = params.model || STORYBOARD_MODEL;
  const system = buildSystemPrompt(params.kind);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: AgentType.User, content: params.initialUserMessage },
  ];

  let lastRaw = '';
  let lastProblem = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = String(
      await getLLMCompletion({
        model,
        system,
        messages,
        maxTokens: 4000,
        temperature: attempt === 1 ? 0.4 : 0,
        metadata: {
          caller: 'marketing-storyboard',
          kind: params.kind,
          attempt,
        },
      })
    );
    lastRaw = raw;

    let candidate: unknown;
    try {
      candidate = extractJson(raw);
    } catch (err) {
      if (attempt === 2) throw err;
      lastProblem =
        err instanceof Error ? err.message : 'The model did not return JSON.';
      messages.push(
        { role: AgentType.Assistant, content: raw.slice(0, 2000) },
        {
          role: AgentType.User,
          content: `${lastProblem}\nReturn only the storyboard JSON object, with no prose or code fences.`,
        }
      );
      continue;
    }

    const result = safeParseStoryboard(candidate);
    if (result.success) {
      const estimate = estimateRenderSeconds(result.data);
      if (params.kind === 'CLIP' && estimate > MAX_CLIP_SECONDS) {
        lastProblem = `the clip would run about ${Math.round(estimate)}s; clips are short-form and must estimate under ${MAX_CLIP_SECONDS}s. Cut scenes, holds, and waits until one feature fits.`;
        if (attempt === 2) break;
        messages.push(
          { role: AgentType.Assistant, content: JSON.stringify(candidate) },
          {
            role: AgentType.User,
            content: `That storyboard is too long: ${lastProblem}\nReturn the shortened storyboard JSON only.`,
          }
        );
        continue;
      }
      return { storyboard: result.data, model, raw };
    }

    lastProblem = describeStoryboardError(result.error);
    if (attempt === 2) break;

    messages.push(
      { role: AgentType.Assistant, content: JSON.stringify(candidate) },
      {
        role: AgentType.User,
        content: [
          'That storyboard failed validation:',
          lastProblem,
          '',
          'Fix those problems and return the corrected storyboard JSON only.',
        ].join('\n'),
      }
    );
  }

  throw new StoryboardGenerationError(
    `The generated storyboard was not valid: ${lastProblem}`,
    lastRaw
  );
}

/** Summary shown to the admin before a job is queued. */
export function summarizeStoryboard(storyboard: MarketingStoryboard) {
  return {
    scenes: storyboard.scenes.length,
    estimatedSeconds: estimateRenderSeconds(storyboard),
    routes: Array.from(
      new Set(storyboard.scenes.map((scene) => scene.goto).filter(Boolean))
    ) as string[],
  };
}

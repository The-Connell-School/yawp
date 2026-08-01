import {
  ALLOWED_KEYS,
  ALLOWED_ROUTES,
  MARKETING_PERSONAS,
  MAX_RENDER_SECONDS,
  MAX_SCENES,
  describeStoryboardError,
  estimateRenderSeconds,
  safeParseStoryboard,
  type MarketingJobKind,
  type MarketingStoryboard,
  type MarketingSubjectType,
} from '../../../../packages/marketing-media';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';

const STORYBOARD_MODEL = 'claude-sonnet-4-6';

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
          'This storyboard becomes a short silent clip, so it must read without narration or audio.',
          'Keep it to four to six scenes and roughly thirty seconds of screen time.',
          'Give each scene a hold of at least 1.5 seconds so a viewer can read the screen.',
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
    'Rules:',
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
  const model = params.model || STORYBOARD_MODEL;
  const system = buildSystemPrompt(params.kind);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: AgentType.User, content: buildUserPrompt(params) },
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

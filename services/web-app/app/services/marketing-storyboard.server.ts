import {
  ALLOWED_KEYS,
  ALLOWED_ROUTES,
  MARKETING_PERSONAS,
  MAX_RENDER_SECONDS,
  MAX_SCENES,
  describeRoutesForPrompt,
  describeStoryboardError,
  diffStoryboards,
  estimateRenderSeconds,
  lintGuideStoryboard,
  safeParseStoryboard,
  validateGuideStoryboard,
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

/**
 * Appended when the call is a revision rather than a first take.
 *
 * Everything else in the system prompt is written for "you write storyboards
 * from a brief". Told only that, a model re-imagines the brief and returns a
 * different clip — one that may be fine on its own terms but is not the take
 * the operator watched with the one thing they complained about fixed. That
 * reads, correctly, as feedback being ignored. This says the job is an edit.
 */
const REVISION_INSTRUCTIONS = [
  '',
  'THIS CALL IS A REVISION. You are editing a storyboard that has already been',
  'filmed, not writing a new one. The operator watched that take and said what',
  'to change.',
  '',
  '- Start from the storyboard you are given and apply the smallest set of',
  '  changes that satisfies the feedback.',
  '- Keep the slug, the title, and the scene ids. Keep every scene, step,',
  '  overlay, hold, and focus the feedback does not question — reusing an id is',
  '  how the operator sees that a scene survived rather than being replaced.',
  '- Do not rewrite copy, reorder scenes, or "improve" anything you were not',
  '  asked about. A revision that changes more than it was asked to is worse',
  '  than one that changes too little.',
  '- Returning the storyboard unchanged is not an option. If the feedback seems',
  '  already satisfied, find what the operator is actually seeing — a hold too',
  '  short to read, a scroll that never happens, a focus aimed at the wrong',
  '  element — and change that.',
].join('\n');

/**
 * The house standard for how-to guides, from docs/how-to-guides.md and the
 * reviews behind it (Lesson Planner, Reporter, Thesis-Driven Essay). A GUIDE
 * job is held to the same bar a hand-built "See how it works" page is.
 */
const GUIDE_INSTRUCTIONS = [
  'This storyboard becomes a HOW-TO GUIDE: one shareable page in the shape of the YAWP! "See how it works" guides. The renderer films your scenes once, cuts each step scene into its own short silent loop, takes a still of every guide scene, and lays the page out from the copy you write. Schools read it, teachers forward it to a department head, and districts approve features from it.',
  '',
  'THE JOB OF A GUIDE',
  'A guide is the teaser that gets a teacher to try the feature. It is not the manual, the abstract, or the defense of how it was built. "You\'ve got to put the hay down low enough where the goats can reach it." Give a teacher only what they need to jump in.',
  '',
  'SHAPE (tag every scene that appears in the guide with "guide": { "section": ... })',
  '1. Hero: exactly one scene with "section": "hero" and "screenshot": true. It is the still beside the headline. Land on the screen where the feature lives, looking its best.',
  '2. What it can do: at most one "range" scene that shows the full range of what the feature makes (its starter options, its menu of types), plus the same range as a short bulleted list in guide.canDo for readers who skim past the picture. Show the range before walking through one workflow.',
  '3. The main workflow: 3 numbered steps at most, each a "step" scene. Each step is one thing happening on screen, so it loops cleanly: one click, one panel opening, one paced scroll through a list. Give each a short heading that says what the teacher does and a body of one or two sentences. Put guide.workflowHeading over the steps, saying what the workflow is for ("Track student growth over time"). Then list the real moments a teacher uses it in guide.useCases (parent-teacher conferences, the end of a marking period, a department meeting, bell work). Do the thinking for them.',
  '4. Extras: up to 3 "extra" scenes for the other big things it does, one heading and one line each.',
  '5. What it will do / What it won’t do: guide.will and guide.wont.',
  '6. Footer: guide.footerNote, the honest demo line, and guide.startLabel for the start button ("Open Daily Pages").',
  'Scenes that only get the camera somewhere (navigation, a click through a list) carry no "guide" field. They are filmed but never shown.',
  '',
  'RULES FOR THE COPY',
  '- Less is more. One or two sentences per section, then the picture does the rest.',
  '- Say what it does, in simple terms. Do not describe what they will experience: progress bars, what appears where, or which screen comes next. They will see it.',
  '- Name the controls that matter, once. "Answers are one tap: suggested replies, a slider for the period length, and a checklist of activity types" is the model.',
  '- No secret sauce. Never explain how it works inside: prompts, rules it follows, what it searches, how it decides, or which AI model it uses.',
  '- Always include "What it will do" and "What it won’t do". The won’t column matters most. Lead it with student safety and data: what it never does to or with students. Every line has to be true. Only claim what the brief states or what the filmed screens plainly show; if you are not sure a line is true, leave it out rather than soften it. Never write "it never sends student data anywhere".',
  '- Cut AI-sounding copy: no em-dash asides, no "not X, but Y", no "not just", no clever headings, no seamless, effortless, unlock, empower, leverage, supercharge, elevate, streamline, or magic. Plain and direct: "Speaker notes included."',
  '- Make headings say the thing: "Create a full unit of study", not "A unit map first, then one day at a time".',
  '- Always use the Oxford comma, in every line: "class reports, student growth reports, and growth plans".',
  '- Write the product name as YAWP!, in capitals with the exclamation mark.',
  '- Be honest about the demo: the footer note says the media uses demo classes, and that any AI replies shown were scripted for the recording if they were.',
  '- Headline: one line that says what the feature does for a teacher, with guide.highlight set to the few words of it that matter most. Lede: one or two sentences.',
  '',
  'Examples of the voice, from the Reporter guide:',
  '  headline "Ask about your classes in plain language." with highlight "in plain language."',
  '  lede "Reporter turns your released grades into class reports, student growth reports, and growth plans."',
  '  step heading "See the whole class at once", body "Every student’s average, and who is trending down."',
  '  won’t "Change, give, or release grades." and "Talk to students. It’s for teachers only."',
  '  footer "Clips use demo classes. Reporter’s replies in them were scripted for the recording from the demo class’s real numbers."',
  '',
  'FILMING A GUIDE',
  '- The run is filmed once with an enlarged cursor, then cut per step, so each step scene should start on the screen it is about and do one legible motion. Give it a hold of 1.5 to 2.5 seconds so the loop lands on the result.',
  '- A step scene with no motion is shown as a still. That is fine for a result screen, but most steps should move.',
  '- Leave "overlay" and "focus" off guide scenes. The page carries the words and shows the media at full width.',
  '',
  'Guide copy fields:',
  '  storyboard "guide": {',
  '    "headline": "...", "highlight": "words from the headline", "lede": "...",',
  '    "workflowHeading": "...", "canDo": ["..."], "useCases": ["..."],',
  '    "will": ["..."], "wont": ["..."], "footerNote": "...", "startLabel": "..."',
  '  }',
  '  scene "guide": { "section": "hero" | "range" | "step" | "extra", "heading": "...", "body": "..." }',
];

function buildSystemPrompt(kind: MarketingJobKind, revising = false): string {
  const shape =
    kind === 'GUIDE'
      ? GUIDE_INSTRUCTIONS
      : kind === 'CLIP'
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
    '      "caption": "what a viewer is looking at",',
    '      "overlay": "short line burned onto the clip while this scene plays",',
    '      "startsClip": true on the one scene the clip should open on,',
    '      "focus": { "role": "button", "name": "Prompt Library", "scale": 1.5 }',
    '    }',
    '  ]',
    '}',
    '',
    'Write an "overlay" for every scene of a CLIP. It is the only text an',
    'audience ever sees — these clips are silent, with no narration. Give the',
    'benefit in the product\'s own words, present tense, under 60 characters:',
    '"Assign daily writing in seconds", "Feedback students actually read".',
    'Do not narrate the cursor. "Teacher clicks the Daily Pages card" is a',
    'caption, not an overlay, and reads like a test log on screen.',
    '',
    'A scene may also carry a "focus". The clip plays the interaction at full',
    'width and then pushes in on that element for the scene\'s hold, which is',
    'the only reason product text is legible once the clip is playing at feed',
    'size. Aim it at the thing the scene is about — the expanded panel, the',
    'graded feedback, the editor — not at a button that was already clicked.',
    '',
    'A focus is aimed exactly like a step: give it "selector", or "role" plus',
    '"name", or "text" — plus a "scale" between 1.2 and 2. There is no',
    '"target" key. All three of these are valid:',
    '  "focus": { "role": "button", "name": "Prompt Library", "scale": 1.5 }',
    '  "focus": { "text": "Overall Feedback", "scale": 1.6 }',
    '  "focus": { "selector": ".ProseMirror", "scale": 1.4 }',
    'A focus with only a "scale" and nothing to aim at is dropped. Omit the',
    'whole field when no single element is worth pushing in on.',
    '',
    'Opening a panel is not the same as showing it. A scene that clicks into a',
    'list — a prompt library, a queue of submissions, a class roster — and then',
    'holds still shows half of the first row before the clip ends, and the',
    'viewer never learns there is a list at all. Give that scene a paced',
    'scroll: { "action": "scroll", "y": 500, "seconds": 3 } moves through the',
    'content over three seconds instead of jumping. Wait a beat after the click',
    'first, so the scroll does not race the panel opening.',
    'When a scene scrolls through a list, leave "focus" off — the movement is',
    'what makes the point, and pushing in on one row throws away the rest.',
    '',
    'Detail pages — a graded submission, a class, a document — have no route',
    'of their own here; reach them by clicking from a list. When the clip is',
    'really about the detail page, set "startsClip": true on that scene. The',
    'walk there is still filmed but trimmed off, so the clip opens on the',
    'screen worth showing instead of on a list nobody needs to see.',
    '',
    'Steps may be:',
    '  { "action": "click" | "hover" | "scrollTo" | "waitFor", target }',
    '  { "action": "fill" | "type", target, "value": "text" }',
    `  { "action": "press", "key": ${ALLOWED_KEYS.join(' | ')} }`,
    '  { "action": "scroll", "y": pixels, "seconds": how long to take }',
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
    ...(revising ? [REVISION_INSTRUCTIONS] : []),
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
    params.kind === 'GUIDE'
      ? 'Deliverable: a how-to guide, in the shape and voice described above.'
      : params.kind === 'CLIP'
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
 * Drop a "focus" that has nothing to aim at.
 *
 * Unlike a step, a focus never drives the browser — it only aims the push-in
 * the framing stage animates. So an unaimable one is not a safety question,
 * it is a missing polish pass, and failing the whole storyboard over it burns
 * two model calls and hands the admin a dead job for a zoom we could simply
 * leave out. Everything else is still validated exactly as strictly.
 */
function dropUnaimableFocus(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const storyboard = candidate as { scenes?: unknown };
  if (!Array.isArray(storyboard.scenes)) return candidate;

  return {
    ...storyboard,
    scenes: storyboard.scenes.map((scene) => {
      if (!scene || typeof scene !== 'object' || Array.isArray(scene))
        return scene;
      const fields = scene as Record<string, unknown>;
      if (fields.focus === undefined || fields.focus === null) return scene;

      const aim = fields.focus as Record<string, unknown>;
      // Mirrors the schema's hasTarget: a name on its own aims at nothing.
      const aimed =
        typeof aim === 'object' &&
        !Array.isArray(aim) &&
        Boolean(aim.selector || aim.role || aim.text);
      if (aimed) return scene;

      const { focus: _dropped, ...withoutFocus } = fields;
      return withoutFocus;
    }),
  };
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
    // Indented, and ahead of the feedback on purpose. The feedback is what the
    // call is about, so it reads last, next to the instruction, rather than
    // above a wall of JSON the model has to scroll back through.
    JSON.stringify(params.previousStoryboard, null, 2),
    '',
    'Operator feedback on that take:',
    params.feedback.trim(),
    '',
    'Apply that feedback to the storyboard above and return the result. Change',
    'only what the feedback calls for. Return only the storyboard JSON.',
  ];
  return runStoryboardGeneration({
    kind: params.kind,
    model: params.model,
    initialUserMessage: lines.join('\n'),
    previousStoryboard: params.previousStoryboard,
  });
}

async function runStoryboardGeneration(params: {
  kind: MarketingJobKind;
  model?: string;
  initialUserMessage: string;
  /** Set on a revision. Its presence is what makes this call an edit. */
  previousStoryboard?: unknown;
}): Promise<GenerateStoryboardResult> {
  const model = params.model || STORYBOARD_MODEL;
  const revising = params.previousStoryboard !== undefined;
  const system = buildSystemPrompt(params.kind, revising);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: AgentType.User, content: params.initialUserMessage },
  ];

  let lastRaw = '';
  let lastProblem = '';
  /** The revision failed because nothing moved, not because the JSON was bad. */
  let unrevised = false;
  /**
   * A guide that had the right shape but was sent back for copy. Kept so a
   * second take that comes back worse cannot cost the admin a usable guide.
   */
  let usableGuide: MarketingStoryboard | null = null;

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
        // Studio renders are an admin tool with no tenant to bill.
        attribution: {
          organizationId: null,
          membershipId: null,
          route: 'services/marketing-storyboard.server',
          requestId: crypto.randomUUID(),
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

    const result = safeParseStoryboard(dropUnaimableFocus(candidate));
    if (result.success) {
      const estimate = estimateRenderSeconds(result.data);
      if (params.kind === 'CLIP' && estimate > MAX_CLIP_SECONDS) {
        lastProblem = `the clip would run about ${Math.round(estimate)}s; clips are short-form and must estimate under ${MAX_CLIP_SECONDS}s. Cut scenes, holds, and waits until one feature fits.`;
        if (attempt === 2) break;
        messages.push(
          { role: AgentType.Assistant, content: JSON.stringify(candidate) },
          {
            role: AgentType.User,
            content: [
              `That storyboard is too long: ${lastProblem}`,
              // Feedback usually asks for MORE time on something. Told only to
              // cut, the model cuts the thing it was just asked to add, and the
              // revision lands looking like it ignored the note.
              ...(revising
                ? [
                    'Cut somewhere else: whatever the feedback asked for stays, at the length it asked for.',
                  ]
                : []),
              'Return the shortened storyboard JSON only.',
            ].join('\n'),
          }
        );
        continue;
      }

      // A revision that comes back byte-identical has not revised anything.
      // Queueing it burns a worker slot to re-film the take the operator was
      // complaining about, and hands them a "new" render that is the old one.
      if (
        revising &&
        diffStoryboards(params.previousStoryboard, result.data).length === 0
      ) {
        unrevised = true;
        lastProblem =
          'the model handed back the previous storyboard unchanged, twice. Try saying which scene is wrong and what should happen instead.';
        if (attempt === 2) break;
        messages.push(
          { role: AgentType.Assistant, content: JSON.stringify(candidate) },
          {
            role: AgentType.User,
            content: [
              'That is the storyboard you were given, unchanged. Nothing in it',
              'moved, so the feedback has not been applied.',
              '',
              'Find the specific field the operator is describing — a hold too',
              'short to read, a missing or unpaced scroll, a focus aimed at the',
              'wrong element, a scene that ends before the thing appears — and',
              'change it. Return only the revised storyboard JSON.',
            ].join('\n'),
          }
        );
        continue;
      }

      if (params.kind === 'GUIDE') {
        const shapeProblems = validateGuideStoryboard(result.data);
        if (shapeProblems.length > 0) {
          lastProblem = shapeProblems.join('; ');
          if (attempt === 2) break;
          messages.push(
            { role: AgentType.Assistant, content: JSON.stringify(candidate) },
            {
              role: AgentType.User,
              content: [
                'That storyboard is not a complete how-to guide:',
                ...shapeProblems.map((problem) => `- ${problem}`),
                '',
                'Fix those and return the corrected storyboard JSON only.',
              ].join('\n'),
            }
          );
          continue;
        }

        // Copy style gets one more pass, never a failure: the lint is a
        // heuristic, and a misread line must not cost the admin the guide.
        const copyProblems = lintGuideStoryboard(result.data);
        if (copyProblems.length > 0 && attempt === 1) {
          usableGuide = result.data;
          messages.push(
            { role: AgentType.Assistant, content: JSON.stringify(candidate) },
            {
              role: AgentType.User,
              content: [
                'The guide copy needs one more pass against the house rules:',
                ...copyProblems.map((problem) => `- ${problem}`),
                '',
                'Rewrite only those lines, plain and direct, and keep everything else. Return the storyboard JSON only.',
              ].join('\n'),
            }
          );
          continue;
        }
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

  if (usableGuide) return { storyboard: usableGuide, model, raw: lastRaw };

  throw new StoryboardGenerationError(
    unrevised
      ? `The revision changed nothing: ${lastProblem}`
      : `The generated storyboard was not valid: ${lastProblem}`,
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

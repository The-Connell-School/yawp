import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { anthropic } from '~/services/anthropic';
import type { DbqSource, DraftingPhase, FailureFlag } from '~/components/dbq/types';

const SourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  attribution: z.string(),
  body: z.string(),
  caption: z.string().optional(),
});

const PlanningSchema = z.object({
  outline: z.string(),
  thesisDraft: z.string(),
  docGroupings: z.string(),
  outsideEvidence: z.string(),
});

const PromptContextSchema = z.object({
  prompt: z.string(),
  title: z.string(),
  era: z.array(z.string()),
  sources: z.array(SourceSchema),
});

const PhaseSchema = z.enum([
  'source-analysis',
  'thesis',
  'contextualization',
  'drafting',
  'revision',
]);

const ReplyBody = z.object({
  mode: z.literal('reply'),
  question: z.string().min(1),
  history: z.array(z.object({ role: z.enum(['tutor', 'student']), body: z.string() })),
  essay: z.string(),
  planning: PlanningSchema,
  phase: PhaseSchema,
  promptContext: PromptContextSchema,
});

const ScanBody = z.object({
  mode: z.literal('scan'),
  essay: z.string(),
  planning: PlanningSchema,
  phase: PhaseSchema,
  alreadyFired: z.array(z.string()),
  promptContext: PromptContextSchema,
});

const Body = z.discriminatedUnion('mode', [ReplyBody, ScanBody]);

const MODEL = process.env.AI_MODEL ?? 'claude-sonnet-4-6';

function sourcesBlock(sources: DbqSource[]): string {
  return sources
    .map(
      (s) =>
        `--- Doc ${s.label}: ${s.title} (${s.attribution})\n${s.body.trim()}`
    )
    .join('\n\n');
}

function planningBlock(p: z.infer<typeof PlanningSchema>): string {
  return [
    `Outline:\n${p.outline || '(empty)'}`,
    `Thesis draft:\n${p.thesisDraft || '(empty)'}`,
    `Doc groupings:\n${p.docGroupings || '(empty)'}`,
    `Outside evidence:\n${p.outsideEvidence || '(empty)'}`,
  ].join('\n\n');
}

const REPLY_SYSTEM = `You are an AP US History DBQ writing tutor for a high-school student
mid-draft. You are Socratic and concrete. Stay short — 2-4 sentences,
no bullet lists unless the student asks for one. Push the student to do
the historical thinking; do NOT write their thesis or paragraphs for
them. Reference specific documents by their label (e.g. "Doc B") and
specific outside evidence by name. Never break character or mention
that you are an AI.`;

const SCAN_SYSTEM = `You are a silent reviewer that watches an AP US History DBQ draft as
the student writes. Your job is to detect, at most, the highest-leverage
failure modes currently visible in the draft and surface each as a
short, actionable flag. Only flag what is clearly present in the
current essay text. Do not invent issues. If nothing is wrong yet,
return an empty array. Never flag the same id more than once per
session — caller will tell you which ids have already fired.

Allowed flag ids (use exactly one of these, picking the closest fit):
- thesis-restates-prompt — the opener echoes the prompt without staking a position
- walking-through-documents — citations are appearing in document order, not in argumentative order
- length-not-sophistication — the essay is getting long but lacks qualification / counter-move
- no-outside-evidence — the student is well into drafting with no outside evidence
- sourcing-missing — multiple documents are cited but none are sourced (HIPP)
- thesis-hedging — thesis avoids taking a position on "extent"

Respond ONLY with strict JSON of shape:
{ "flags": [ { "id": "...", "label": "...", "detail": "..." } ] }
Label is <=8 words. Detail is one sentence, <=200 chars, addressed to
the student. Maximum 2 flags per response.`;

function buildReplyUserPrompt(input: z.infer<typeof ReplyBody>): string {
  const recent = input.history.slice(-8);
  const transcript = recent
    .map((m) => `${m.role === 'tutor' ? 'Tutor' : 'Student'}: ${m.body}`)
    .join('\n');
  return `# DBQ prompt
${input.promptContext.prompt}

# Documents available
${sourcesBlock(input.promptContext.sources)}

# Student's current planning notes
${planningBlock(input.planning)}

# Student's essay so far
${input.essay || '(blank)'}

# Phase
${input.phase}

# Recent conversation
${transcript || '(no prior turns)'}

# New student message
${input.question}

Respond as the tutor.`;
}

function buildScanUserPrompt(input: z.infer<typeof ScanBody>): string {
  return `# DBQ prompt
${input.promptContext.prompt}

# Documents available
${sourcesBlock(input.promptContext.sources)}

# Planning notes
${planningBlock(input.planning)}

# Current phase
${input.phase}

# Essay draft
${input.essay || '(blank)'}

# Flag ids already fired (do NOT repeat)
${input.alreadyFired.join(', ') || '(none)'}

Return the JSON now.`;
}

function extractText(message: { content: Array<{ type: string }> }): string {
  const block = message.content.find((b) => b.type === 'text') as
    | { type: 'text'; text: string }
    | undefined;
  return block?.text ?? '';
}

function parseFlags(raw: string, alreadyFired: string[]): FailureFlag[] {
  if (!raw) return [];
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(trimmed);
    const out: FailureFlag[] = [];
    const seen = new Set(alreadyFired);
    for (const f of parsed.flags ?? []) {
      if (typeof f?.id !== 'string') continue;
      if (seen.has(f.id)) continue;
      out.push({
        id: f.id,
        label: String(f.label ?? f.id),
        detail: String(f.detail ?? ''),
      });
      seen.add(f.id);
    }
    return out;
  } catch {
    return [];
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return dataResponse({ error: 'Method not allowed' }, { status: 405 });
  }
  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return dataResponse(
      { error: 'Invalid body', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;

  try {
    if (body.mode === 'reply') {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        temperature: 0.5,
        system: REPLY_SYSTEM,
        messages: [{ role: 'user', content: buildReplyUserPrompt(body) }],
      });
      return dataResponse({ reply: extractText(message).trim() });
    }

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      temperature: 0,
      system: SCAN_SYSTEM,
      messages: [{ role: 'user', content: buildScanUserPrompt(body) }],
    });
    return dataResponse({ flags: parseFlags(extractText(message), body.alreadyFired) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Anthropic call failed';
    return dataResponse({ error: msg }, { status: 502 });
  }
}

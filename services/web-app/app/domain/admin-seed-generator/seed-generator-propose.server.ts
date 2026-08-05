/**
 * Calls the LLM chokepoint (getLLMCompletion) to turn a plain-language admin
 * request into a structured seed-data proposal. Nothing here writes to the
 * database -- see seed-generator-write.server.ts for that, which only runs
 * after a human approves individual items.
 */
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import {
  SEED_GENERATOR_TOOL,
  seedProposalSchema,
  type SeedProposal,
} from './seed-generator-schema';

export type SeedGeneratorContext = {
  organizationId: string;
  organizationName: string;
  existingClasses: Array<{ id: string; title: string | null; grade: string; period: string }>;
  existingAssignmentTypes: Array<{ id: string; title: string; description: string | null }>;
};

export const SEED_GENERATOR_FAILED =
  'The seed generator could not build a proposal from that description. Try rephrasing, or being more specific about grade level, class, and how many students.';

export const SEED_GENERATOR_NO_ASSIGNMENT_TYPES =
  'This organization has no enabled assignment types, so no assignments (and therefore no submissions) can be generated. Enable at least one assignment type for this organization first.';

export function buildSeedGeneratorSystemPrompt(ctx: SeedGeneratorContext): string {
  const classLines = ctx.existingClasses.length
    ? ctx.existingClasses
        .map(
          (c) =>
            `- ${c.id}: "${c.title ?? 'Untitled'}" (grade ${c.grade}, period ${c.period})`
        )
        .join('\n')
    : '(none yet -- any student you propose needs a brand-new class)';
  const typeLines = ctx.existingAssignmentTypes.length
    ? ctx.existingAssignmentTypes
        .map((t) => `- "${t.title}"${t.description ? ` -- ${t.description}` : ''}`)
        .join('\n')
    : '(none enabled for this organization)';

  return `You generate realistic DEMO data for a writing-instruction platform called Yawp, scoped to one school organization: "${ctx.organizationName}".

An admin described what demo data they want in plain language. Turn that into a structured proposal by calling the propose_seed_data tool exactly once. After the tool call, reply with at most one short sentence -- the tool call itself is the deliverable, not prose.

This organization's existing classes (reference by id in a "classLocalId" field to add to one instead of creating a new class):
${classLines}

This organization's enabled assignment types (an assignment's assignmentTypeTitle must exactly match one of these titles verbatim):
${typeLines}

Rules:
- Every essay is real, full-length writing you author yourself -- several paragraphs, not a placeholder or a summary of what the essay would say. Match the requested writing profile: "struggling" must read as genuinely weak writing (thin evidence, disorganized structure, mechanical/grammar errors), "on_track" as competent grade-level writing, "advanced" as strong writing with real insight.
- Ground grades in the essay you wrote: a "struggling" submission should not receive a 95, and an "advanced" one should not receive a 60.
- Only propose assignments using an assignment type title from the list above, verbatim. If that list is empty, do not propose any assignments or students with submissions -- reply in text explaining that no assignment types are enabled instead of calling the tool.
- Keep proposals proportionate to the request. "A few struggling writers" means 2-4 students, not 20.
- A student's classLocalId may point at a brand-new class you're proposing, or at an existing class id from the list above. A submission's assignmentLocalId must point at an assignment inside THIS proposal (existing assignments cannot be referenced yet).`;
}

export async function proposeSeedData(params: {
  ctx: SeedGeneratorContext;
  instructions: string;
}): Promise<{ proposal: SeedProposal } | { error: string }> {
  if (params.ctx.existingAssignmentTypes.length === 0) {
    return { error: SEED_GENERATOR_NO_ASSIGNMENT_TYPES };
  }

  let capturedProposal: SeedProposal | null = null;

  try {
    await getLLMCompletion({
      model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
      system: buildSeedGeneratorSystemPrompt(params.ctx),
      messages: [{ role: AgentType.User, content: params.instructions }],
      maxTokens: 8000,
      temperature: 0.7,
      maxToolRounds: 2,
      tools: [SEED_GENERATOR_TOOL],
      handleToolCall: async (name, input) => {
        if (name !== SEED_GENERATOR_TOOL.name) {
          return JSON.stringify({ error: `Unknown tool "${name}".` });
        }
        const parsed = seedProposalSchema.safeParse(input);
        if (!parsed.success) {
          return JSON.stringify({
            error:
              'That proposal did not match the required shape. Fix it and call propose_seed_data again.',
            issues: parsed.error.issues.slice(0, 10).map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        capturedProposal = parsed.data;
        return JSON.stringify({ received: true });
      },
      allowFallbackProvider: false,
      logPayload: 'metadata-only',
      metadata: {
        feature: 'admin-seed-generator',
        organizationId: params.ctx.organizationId,
      },
    });
  } catch {
    return { error: SEED_GENERATOR_FAILED };
  }

  if (!capturedProposal) {
    return { error: SEED_GENERATOR_FAILED };
  }

  return { proposal: capturedProposal };
}

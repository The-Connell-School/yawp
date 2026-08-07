/**
 * Phase-one seed generation. This call produces only the durable entity graph;
 * essay prose and grading are deliberately deferred to per-submission fills.
 */
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import {
  SEED_GRAPH_TOOL,
  seedGraphProposalSchema,
  type SeedGraphProposal,
} from './seed-generator-schema';
import type { PersistedSeedGeneratorNode } from './seed-generator-graph';

export type SeedGeneratorContext = {
  organizationId: string;
  organizationName: string;
  existingClasses: Array<{
    id: string;
    title: string | null;
    grade: string;
    period: string;
  }>;
  existingAssignmentTypes: Array<{
    id: string;
    title: string;
    description: string | null;
  }>;
};

export type SeedGeneratorError = {
  type: 'transient' | 'unparseable';
  message: string;
};

export const SEED_GENERATOR_TRANSIENT_MESSAGE =
  'The seed generator is temporarily unavailable. Retry this request in a moment.';
export const SEED_GENERATOR_UNPARSEABLE_MESSAGE =
  'The seed generator could not turn those instructions into a valid graph. Rephrase with a specific class, assignment, and student count.';
export const SEED_GENERATOR_NO_ASSIGNMENT_TYPES =
  'This organization has no enabled assignment types, so no assignments (and therefore no submissions) can be generated. Enable at least one assignment type for this organization first.';
export const SEED_GRAPH_REQUEST_DEADLINE_MS = 5_000;

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const status =
    (error as Record<string, unknown>).status ??
    (error as Record<string, unknown>).statusCode;
  return typeof status === 'number' ? status : null;
}

export function classifySeedGeneratorError(error: unknown): SeedGeneratorError {
  const status = errorStatus(error);
  const name = error instanceof Error ? error.name : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    status === 408 ||
    status === 429 ||
    (status != null && status >= 500) ||
    /timed?\s*out|timeout|rate.?limit|overload|provider|network|ECONN/i.test(
      message
    )
  ) {
    return { type: 'transient', message: SEED_GENERATOR_TRANSIENT_MESSAGE };
  }
  return { type: 'unparseable', message: SEED_GENERATOR_UNPARSEABLE_MESSAGE };
}

function graphContextForPrompt(nodes: PersistedSeedGeneratorNode[]) {
  return nodes.map((node) => {
    const {
      essayText: _essayText,
      grade: _grade,
      ...structuralData
    } = node.data;
    return {
      localId: node.localId,
      kind: node.kind,
      parentLocalId: node.parentLocalId,
      status: node.status,
      committedEntityId: node.committedEntityId,
      data: structuralData,
    };
  });
}

export function buildSeedGeneratorSystemPrompt(
  ctx: SeedGeneratorContext,
  currentNodes: PersistedSeedGeneratorNode[] = []
): string {
  const classLines = ctx.existingClasses.length
    ? ctx.existingClasses
        .map(
          (klass) =>
            `- ${klass.id}: "${klass.title ?? 'Untitled'}" (grade ${klass.grade}, period ${klass.period})`
        )
        .join('\n')
    : '(none yet — create a class before attaching students or assignments)';
  const typeLines = ctx.existingAssignmentTypes.length
    ? ctx.existingAssignmentTypes
        .map(
          (type) =>
            `- "${type.title}"${type.description ? ` — ${type.description}` : ''}`
        )
        .join('\n')
    : '(none enabled for this organization)';
  const graph = currentNodes.length
    ? JSON.stringify(graphContextForPrompt(currentNodes), null, 2)
    : '(this is a new thread; no graph nodes exist yet)';

  return `You build the STRUCTURAL PASS for realistic demo data in Yawp, scoped to "${ctx.organizationName}".

Call propose_seed_graph exactly once. Return entity names and relationships only. Do not write essay prose in this phase. Do not produce assignment grades, rubric scores, percentages, or feedback in this phase. Long content is filled one submission at a time later.

Submission status has precise product meaning:
- draft: the student is still writing and has not submitted anything. Yawp will create a Document but no Submission row.
- submitted: the student turned it in, but it is awaiting grading. Yawp will create both a Document and an ungraded Submission row.
- graded: the student turned it in and it has been graded. The separate content-fill phase will generate the grade.

Worked examples (follow these exactly):
- "Maya turned in her essay, but it is not yet graded" -> status: submitted.
- "Maya hasn't turned it in" -> status: draft.
- "Maya's essay has a released B" -> status: graded.

Relationship contract:
- class has parentLocalId: "" (empty string -- a class has no parent; never the literal word null).
- assignment points to its class localId, or an existing class id.
- student points to their class localId, or an existing class id.
- document points to its assignment and stores studentLocalId in data.
- submission points to its document and stores only status in data.
- Every new submission needs its own uncommitted document node. Never attach a new submission to a committed document; propose a fresh document for that student and assignment instead.
- Use fresh, unique localIds for new nodes. Do not repeat existing nodes in your proposal. You may point new nodes at current graph localIds.

Existing classes:
${classLines}

Enabled assignment types (assignmentTypeTitle must match exactly):
${typeLines}

Current durable thread graph (use localId and committedEntityId to resolve follow-ups such as "that student"):
${graph}`;
}

export async function proposeSeedGraph(params: {
  ctx: SeedGeneratorContext;
  instructions: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentNodes?: PersistedSeedGeneratorNode[];
}): Promise<{ graph: SeedGraphProposal; reply: string } | SeedGeneratorError> {
  if (params.ctx.existingAssignmentTypes.length === 0) {
    return {
      type: 'unparseable',
      message: SEED_GENERATOR_NO_ASSIGNMENT_TYPES,
    };
  }

  let capturedGraph: SeedGraphProposal | null = null;
  let invalidToolOutput = false;
  try {
    const reply = await getLLMCompletion({
      model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
      system: buildSeedGeneratorSystemPrompt(
        params.ctx,
        params.currentNodes ?? []
      ),
      messages: [
        ...(params.history ?? []).map((message) => ({
          role:
            message.role === 'assistant' ? AgentType.Assistant : AgentType.User,
          content: message.content,
        })),
        { role: AgentType.User, content: params.instructions },
      ],
      maxTokens: 1_800,
      temperature: 0.2,
      maxToolRounds: 2,
      tools: [SEED_GRAPH_TOOL],
      handleToolCall: async (name, input) => {
        if (name !== SEED_GRAPH_TOOL.name) {
          invalidToolOutput = true;
          return JSON.stringify({ error: `Unknown tool "${name}".` });
        }
        const parsed = seedGraphProposalSchema.safeParse(input);
        if (!parsed.success) {
          invalidToolOutput = true;
          return JSON.stringify({
            error: 'Invalid structural graph.',
            issues: parsed.error.issues.slice(0, 10).map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        capturedGraph = parsed.data;
        return JSON.stringify({ received: true });
      },
      allowFallbackProvider: false,
      signal: AbortSignal.timeout(SEED_GRAPH_REQUEST_DEADLINE_MS),
      logPayload: 'metadata-only',
      metadata: {
        feature: 'admin-seed-generator-structure',
        organizationId: params.ctx.organizationId,
      },
    });
    const graph = capturedGraph as SeedGraphProposal | null;
    if (!graph) {
      return {
        type: 'unparseable',
        message: SEED_GENERATOR_UNPARSEABLE_MESSAGE,
      };
    }
    return {
      graph,
      reply: reply.trim() || `Proposed ${graph.nodes.length} graph nodes.`,
    };
  } catch (error) {
    if (invalidToolOutput) {
      return {
        type: 'unparseable',
        message: SEED_GENERATOR_UNPARSEABLE_MESSAGE,
      };
    }
    return classifySeedGeneratorError(error);
  }
}

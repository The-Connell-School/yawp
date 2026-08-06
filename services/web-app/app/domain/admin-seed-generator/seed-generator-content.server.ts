/** Phase-two generation for one submission node. */
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import {
  SEED_CONTENT_FILL_TOOL,
  seedContentFillSchema,
  type SeedContentFill,
} from './seed-generator-schema';
import {
  classifySeedGeneratorError,
  SEED_GENERATOR_UNPARSEABLE_MESSAGE,
  type SeedGeneratorError,
} from './seed-generator-propose.server';

export const SEED_CONTENT_REQUEST_DEADLINE_MS = 45_000;

export type SeedContentFillInput = {
  organizationId: string;
  organizationName: string;
  assignment: { title: string; prompt: string };
  student: {
    name: string;
    writingProfile: 'struggling' | 'on_track' | 'advanced';
  };
  submission: {
    localId: string;
    status: 'draft' | 'submitted' | 'graded';
  };
};

export function buildSeedContentPrompt(input: SeedContentFillInput) {
  return `Create content for exactly one synthetic student submission in ${input.organizationName}.

Student: ${input.student.name}
Writing profile: ${input.student.writingProfile}
Assignment: ${input.assignment.title}
Assignment prompt: ${input.assignment.prompt}
Submission status: ${input.submission.status}

Call fill_seed_submission exactly once. Write several complete paragraphs in a voice that genuinely matches the writing profile. A struggling writer should show thin evidence, weaker organization, and realistic mechanical errors; on-track work should be competent for grade level; advanced work should show strong insight and control.

Return status exactly as "${input.submission.status}". If it is graded, produce a grade grounded in the essay. If it is draft or submitted, omit grade entirely.`;
}

export async function fillSeedSubmissionContent(
  input: SeedContentFillInput
): Promise<{ content: SeedContentFill } | SeedGeneratorError> {
  let captured: SeedContentFill | null = null;
  let invalidToolOutput = false;
  try {
    await getLLMCompletion({
      model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
      system: buildSeedContentPrompt(input),
      messages: [
        {
          role: AgentType.User,
          content: `Fill submission ${input.submission.localId}.`,
        },
      ],
      maxTokens: 4_500,
      temperature: 0.65,
      maxToolRounds: 2,
      tools: [SEED_CONTENT_FILL_TOOL],
      handleToolCall: async (name, raw) => {
        if (name !== SEED_CONTENT_FILL_TOOL.name) {
          invalidToolOutput = true;
          return JSON.stringify({ error: `Unknown tool "${name}".` });
        }
        const parsed = seedContentFillSchema.safeParse(raw);
        if (!parsed.success || parsed.data.status !== input.submission.status) {
          invalidToolOutput = true;
          return JSON.stringify({
            error: 'Invalid submission content fill.',
            expectedStatus: input.submission.status,
          });
        }
        captured = parsed.data;
        return JSON.stringify({ received: true });
      },
      allowFallbackProvider: false,
      signal: AbortSignal.timeout(SEED_CONTENT_REQUEST_DEADLINE_MS),
      logPayload: 'metadata-only',
      metadata: {
        feature: 'admin-seed-generator-content',
        organizationId: input.organizationId,
        submissionLocalId: input.submission.localId,
      },
    });
    if (!captured || invalidToolOutput) {
      return {
        type: 'unparseable',
        message: SEED_GENERATOR_UNPARSEABLE_MESSAGE,
      };
    }
    return { content: captured };
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

import { getLLMCompletion } from '~/utils/getLLMCompletion/getLLMCompletion';
import type { ContributionBreakdown } from './contribution.server';
import type { GroupGrade } from './grading';
import {
  buildSuggestionPrompt,
  collectMemberWriting,
  parseSuggestions,
  SUGGESTION_SYSTEM_PROMPT,
  type MemberGradeSuggestion,
} from './member-grade-suggestions';

/**
 * Asking the model for individual-grade drafts. Nothing here writes to the
 * database — see `member-grade-suggestions.ts` for why that is deliberate.
 */

const SUGGESTION_MAX_TOKENS = 1400;
/** Low: a teacher comparing two students wants consistency, not variety. */
const SUGGESTION_TEMPERATURE = 0.3;
const SUGGESTION_DEADLINE_MS = 45_000;

export type SuggestMemberGradesResult = {
  suggestions: MemberGradeSuggestion[];
  model: string;
};

export async function suggestMemberGrades({
  breakdown,
  groupGrade,
  assignmentPrompt,
  model = process.env.AI_MODEL ?? 'claude-sonnet-4-6',
  metadata,
}: {
  breakdown: ContributionBreakdown;
  groupGrade: GroupGrade | null;
  assignmentPrompt?: string | null;
  model?: string;
  metadata?: Record<string, unknown>;
}): Promise<SuggestMemberGradesResult> {
  const members = collectMemberWriting({
    members: breakdown.members,
    paragraphs: breakdown.paragraphs,
  });

  // An empty group, or a draft nobody has written in, gives the model nothing to
  // read — and a suggestion drawn from no evidence is the exact thing this
  // feature must not produce.
  if (members.length === 0 || breakdown.totalChars === 0) {
    return { suggestions: [], model };
  }

  const raw = await getLLMCompletion({
    model,
    system: SUGGESTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildSuggestionPrompt({
          assignmentPrompt,
          groupGrade: groupGrade?.score ?? null,
          members,
        }),
      },
    ],
    maxTokens: SUGGESTION_MAX_TOKENS,
    temperature: SUGGESTION_TEMPERATURE,
    allowFallbackProvider: false,
    logPayload: 'metadata-only',
    signal: AbortSignal.timeout(SUGGESTION_DEADLINE_MS),
    metadata: {
      feature: 'group-member-grade-suggestions',
      memberCount: members.length,
      ...metadata,
    },
  });

  return {
    suggestions: parseSuggestions({
      raw,
      memberIds: breakdown.members.map((member) => member.membershipId),
    }),
    model,
  };
}

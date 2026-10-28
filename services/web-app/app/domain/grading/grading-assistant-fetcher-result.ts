import { isScored } from '~/domain/grading/rubric-display';
import { hasMeaningfulGradingFeedbackText } from '~/domain/grading/grading-feedback-text';
import { isLlmRetryResponse } from '~/utils/llm-retry-ui';

export type GradingAssistantFetcherData = {
  success?: boolean;
  message?: string;
  overallComment?: string | null;
  rubricScores?: unknown;
  score?: string | null;
  numericPercentage?: number | null;
  grammarIssues?: unknown;
};

export function getGradingAssistantFetcherErrorMessage(
  data: unknown
): string | null {
  if (!data || typeof data !== 'object') return null;
  if (isLlmRetryResponse(data)) return null;
  if ((data as GradingAssistantFetcherData).success === true) return null;

  const message = (data as GradingAssistantFetcherData).message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }

  return 'Grading Assistant could not generate suggestions. Please try again.';
}

export function gradingAssistantResponseHasVisibleContent(
  data: GradingAssistantFetcherData,
  minScore = 1
): boolean {
  if (hasMeaningfulGradingFeedbackText(data.overallComment ?? undefined)) {
    return true;
  }

  if (typeof data.score === 'string' && data.score.trim().length > 0) {
    return true;
  }

  if (
    typeof data.numericPercentage === 'number' &&
    Number.isFinite(data.numericPercentage)
  ) {
    return true;
  }

  if (Array.isArray(data.grammarIssues) && data.grammarIssues.length > 0) {
    return true;
  }

  if (data.rubricScores && typeof data.rubricScores === 'object') {
    for (const value of Object.values(
      data.rubricScores as Record<string, unknown>
    )) {
      if (!value || typeof value !== 'object') continue;
      const score = (value as { score?: unknown }).score;
      const comment = (value as { comment?: unknown }).comment;
      if (
        typeof score === 'number' &&
        isScored(score, minScore)
      ) {
        return true;
      }
      if (hasMeaningfulGradingFeedbackText(
        typeof comment === 'string' ? comment : undefined
      )) {
        return true;
      }
    }
  }

  return false;
}

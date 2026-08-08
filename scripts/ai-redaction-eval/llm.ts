/**
 * Live Anthropic call helpers for the redaction eval harness.
 *
 * Uses the app's actual Anthropic client wrapper (a one-line
 * `new Anthropic()` singleton with no other side effects) via relative
 * import, so this harness talks to the same SDK configuration the real app
 * uses. Deliberately does NOT go through `getLLMCompletion`
 * (app/utils/getLLMCompletion) because that helper persists every call to
 * `prisma.llmLog`, which would require standing up this worktree's isolated
 * Postgres just to run an eval script — the eval brief explicitly allows
 * calling the underlying Anthropic client directly when that's cleaner, and
 * it is here since the DB is not otherwise needed.
 */
import { anthropic } from '../../services/web-app/app/services/anthropic';
import { rubricKeys, DEFAULT_MIN_SCORE, DEFAULT_MAX_SCORE } from './rubric';
import {
  buildGradingPrompt,
  buildOverallCommentPrompt,
  buildRepairPrompt,
} from './prompt';
import { extractFirstJsonObject } from './json-parse';

export const AI_MODEL = process.env.AI_MODEL?.trim() || 'claude-sonnet-4-5';

export interface RawCategory {
  key: string;
  score: number;
  comment: string;
}

export interface GradingRunResult {
  /** Exact system+user prompt text sent to Anthropic (for leak scanning). */
  outboundSystem: string;
  outboundUserPrompt: string;
  /** Raw model text from the primary grading call. */
  rawResponseText: string;
  categories: RawCategory[];
  overallComment: string;
  /** True if a follow-up overall-comment or repair call was needed. */
  neededRepair: boolean;
  neededOverallCommentFollowup: boolean;
}

async function callAnthropic({
  system,
  userPrompt,
  maxTokens,
  temperature,
}: {
  system: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    system,
    temperature: temperature ?? 0.6,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  return textBlock && 'text' in textBlock ? textBlock.text : '';
}

function isValidCategories(value: unknown): value is RawCategory[] {
  if (!Array.isArray(value)) return false;
  if (value.length !== rubricKeys.length) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as RawCategory).key !== 'string' ||
      typeof (item as RawCategory).score !== 'number' ||
      typeof (item as RawCategory).comment !== 'string'
    ) {
      return false;
    }
    const cat = item as RawCategory;
    if (!rubricKeys.includes(cat.key)) return false;
    if (!Number.isInteger(cat.score)) return false;
    if (cat.score < DEFAULT_MIN_SCORE || cat.score > DEFAULT_MAX_SCORE)
      return false;
    if (seen.has(cat.key)) return false;
    seen.add(cat.key);
  }
  return seen.size === rubricKeys.length;
}

function extractCategories(value: unknown): RawCategory[] | null {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? (value as { categories?: unknown }).categories
      : null;
  return isValidCategories(candidate) ? (candidate as RawCategory[]) : null;
}

/**
 * Runs the full grading flow for one essay under one identity
 * (real name for control, pseudonym for treatment) — mirrors
 * parseAiResponse/buildAiResponseFromCategories/repair fallback chain from
 * route.ts ~912-968, minus persistence.
 */
export async function runGrading({
  firstNameForPrompt,
  essayText,
}: {
  firstNameForPrompt: string;
  essayText: string;
}): Promise<GradingRunResult> {
  const { system, userPrompt } = buildGradingPrompt({
    pseudonymFirstName: firstNameForPrompt,
    essayText,
  });

  const rawResponseText = await callAnthropic({
    system,
    userPrompt,
    maxTokens: 900,
  });

  const parsedJson = extractFirstJsonObject(rawResponseText);
  const directCategories = extractCategories(parsedJson);
  const directOverallComment =
    parsedJson &&
    typeof parsedJson === 'object' &&
    typeof (parsedJson as Record<string, unknown>).overallComment ===
      'string'
      ? ((parsedJson as Record<string, unknown>).overallComment as string)
      : null;

  if (directCategories && directOverallComment) {
    return {
      outboundSystem: system,
      outboundUserPrompt: userPrompt,
      rawResponseText,
      categories: directCategories,
      overallComment: directOverallComment,
      neededRepair: false,
      neededOverallCommentFollowup: false,
    };
  }

  if (directCategories) {
    // Categories parsed but overallComment missing/malformed: real route
    // does a follow-up call to generate just the overall comment.
    const { system: ocSystem, userPrompt: ocUserPrompt } =
      buildOverallCommentPrompt({
        pseudonymFirstName: firstNameForPrompt,
        essayText,
        categoriesJson: JSON.stringify(directCategories),
      });
    const ocRaw = await callAnthropic({
      system: ocSystem,
      userPrompt: ocUserPrompt,
      maxTokens: 300,
      temperature: 0.2,
    });
    const ocParsed = extractFirstJsonObject(ocRaw);
    const overallComment =
      ocParsed &&
      typeof ocParsed === 'object' &&
      typeof (ocParsed as Record<string, unknown>).overallComment ===
        'string'
        ? ((ocParsed as Record<string, unknown>).overallComment as string)
        : `${firstNameForPrompt}, thank you for your submission.`;

    return {
      outboundSystem: system,
      outboundUserPrompt: userPrompt,
      rawResponseText,
      categories: directCategories,
      overallComment,
      neededRepair: false,
      neededOverallCommentFollowup: true,
    };
  }

  // Malformed response: attempt one repair round, mirroring route.ts.
  const { system: repairSystem, userPrompt: repairUserPrompt } =
    buildRepairPrompt({
      pseudonymFirstName: firstNameForPrompt,
      rawResponseText,
      rubricKeys: [...rubricKeys],
    });
  const repairedRaw = await callAnthropic({
    system: repairSystem,
    userPrompt: repairUserPrompt,
    maxTokens: 900,
    temperature: 0.1,
  });
  const repairedParsed = extractFirstJsonObject(repairedRaw);
  const repairedCategories = extractCategories(repairedParsed);
  const repairedOverallComment =
    repairedParsed &&
    typeof repairedParsed === 'object' &&
    typeof (repairedParsed as Record<string, unknown>).overallComment ===
      'string'
      ? ((repairedParsed as Record<string, unknown>).overallComment as string)
      : null;

  if (!repairedCategories) {
    throw new Error(
      `Malformed grading assistant response for "${firstNameForPrompt}" even after repair. Raw: ${rawResponseText.slice(0, 500)}`
    );
  }

  return {
    outboundSystem: system,
    outboundUserPrompt: userPrompt,
    rawResponseText,
    categories: repairedCategories,
    overallComment:
      repairedOverallComment ??
      `${firstNameForPrompt}, thank you for your submission.`,
    neededRepair: true,
    neededOverallCommentFollowup: false,
  };
}

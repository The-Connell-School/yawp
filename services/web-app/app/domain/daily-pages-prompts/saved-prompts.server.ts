// "My prompts": the Daily Pages prompts a teacher generated and kept.
//
// Prompts drafted by the LLM generator are saved here — explicitly with "Save
// prompt", and implicitly whenever the teacher uses one to start an assignment
// — so they show up in the Prompt Library under the "My prompts" filter next to
// the fixed corpus. Saves are keyed by a hash of the prompt text so saving and
// then using the same draft leaves exactly one row.

import { createHash } from 'node:crypto';
import {
  COGNITIVE_MOVES,
  type CognitiveMove,
  type PromptSeriousness,
  type PromptType,
  PROMPT_TYPES,
  type SavedDailyPagesPrompt,
  type SavedPromptFacets,
  SERIOUSNESS_LEVELS,
} from '~/routes/app.assignment-types.$id/prompts-library/data';
import { prisma } from '~/utils/db.server';

/**
 * Daily Pages prompts are one-liners; this is a sanity bound, not a style rule.
 */
export const MAX_SAVED_PROMPT_LENGTH = 2000;

/** Where a saved prompt came from. Only the generator writes today. */
export const SAVED_PROMPT_SOURCE_GENERATOR = 'generator';

/** A save the caller got wrong (empty or implausibly long prompt). */
export class SavedPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SavedPromptError';
  }
}

/**
 * Stable identity for a prompt, ignoring surrounding whitespace. Hashed so the
 * unique index stays small regardless of prompt length.
 */
export function hashPromptText(prompt: string): string {
  return createHash('sha256').update(prompt.trim()).digest('hex');
}

function pick<T extends string>(
  allowed: readonly T[],
  value: unknown
): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Keep only tags that belong to the library's controlled vocabulary. Applied
 * both on write (the client sends them) and on read (rows predate any later
 * vocabulary change), so a stale or bogus tag never reaches the UI.
 */
export function sanitizeFacets(value: unknown): SavedPromptFacets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;

  const facets: SavedPromptFacets = {};
  const type = pick<PromptType>(PROMPT_TYPES, raw.type);
  if (type) facets.type = type;
  const seriousness = pick<PromptSeriousness>(
    SERIOUSNESS_LEVELS,
    raw.seriousness
  );
  if (seriousness) facets.seriousness = seriousness;

  const moves = Array.isArray(raw.cognitiveMoves)
    ? raw.cognitiveMoves
        .map((move) => pick<CognitiveMove>(COGNITIVE_MOVES, move))
        .filter((move): move is CognitiveMove => move !== undefined)
    : [];
  if (moves.length > 0) facets.cognitiveMoves = moves;

  return facets;
}

type SavedPromptRow = {
  id: string;
  prompt: string;
  facets: unknown;
  createdAt: Date;
};

function toSavedPrompt(row: SavedPromptRow): SavedDailyPagesPrompt {
  return {
    id: row.id,
    prompt: row.prompt,
    savedAt: row.createdAt.toISOString(),
    facets: sanitizeFacets(row.facets),
  };
}

export async function saveDailyPagesPrompt(params: {
  membershipId: string;
  assignmentTypeId: string;
  prompt: string;
  facets: SavedPromptFacets;
  source?: string;
}): Promise<SavedDailyPagesPrompt> {
  const prompt = params.prompt.trim();
  if (prompt.length === 0) {
    throw new SavedPromptError('A prompt is required.');
  }
  if (prompt.length > MAX_SAVED_PROMPT_LENGTH) {
    throw new SavedPromptError('That prompt is too long to save.');
  }

  const facets = sanitizeFacets(params.facets);
  const promptHash = hashPromptText(prompt);
  const source = params.source ?? SAVED_PROMPT_SOURCE_GENERATOR;

  const row = await prisma.savedDailyPagesPrompt.upsert({
    where: {
      membershipId_assignmentTypeId_promptHash: {
        membershipId: params.membershipId,
        assignmentTypeId: params.assignmentTypeId,
        promptHash,
      },
    },
    create: {
      membershipId: params.membershipId,
      assignmentTypeId: params.assignmentTypeId,
      prompt,
      promptHash,
      facets,
      source,
    },
    // Re-saving refreshes the tags and restores anything previously removed.
    update: { facets, archivedAt: null },
    select: { id: true, prompt: true, facets: true, createdAt: true },
  });

  return toSavedPrompt(row);
}

export async function listSavedDailyPagesPrompts(params: {
  membershipId: string;
  assignmentTypeId: string;
}): Promise<SavedDailyPagesPrompt[]> {
  const rows = await prisma.savedDailyPagesPrompt.findMany({
    where: {
      membershipId: params.membershipId,
      assignmentTypeId: params.assignmentTypeId,
      archivedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, prompt: true, facets: true, createdAt: true },
  });

  return rows.map(toSavedPrompt);
}

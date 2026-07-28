// "My prompts": the AP English Language prompts a teacher generated and kept.
//
// Prompts drafted by the LLM generator are saved here — explicitly with "Save
// prompt", and implicitly whenever the teacher uses one to start an assignment
// — so they show up in the AP Language Prompt Library under the "My prompts"
// collection next to the curated entries. Saves are keyed by a hash of the
// prompt text so saving and then using the same draft leaves exactly one row.

import { createHash } from 'node:crypto';
import { prisma } from '~/utils/db.server';
import {
  AP_ENGLISH_LANG_DIFFICULTIES,
  AP_ENGLISH_LANG_FRQ_TYPES,
  type SavedApEnglishLangPrompt,
  type SavedPromptFacets,
} from './generated-prompt';

/**
 * Argument prompts run a paragraph at most; this is a sanity bound, not a
 * style rule.
 */
export const MAX_SAVED_PROMPT_LENGTH = 4000;

/** Longest title we keep, and the fallback when the generator omits one. */
export const MAX_SAVED_PROMPT_TITLE_LENGTH = 200;
const FALLBACK_TITLE = 'Untitled prompt';

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
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Keep only tags that belong to the library's vocabulary. Applied both on write
 * (the client sends them) and on read (rows predate any later vocabulary
 * change), so a stale or bogus tag never reaches the UI.
 *
 * frqType and difficulty are closed vocabularies. Focus skill is open — the
 * curated library already carries twenty-odd values and the generator may coin
 * a reasonable new one — so it is only trimmed and bounded.
 */
export function sanitizeFacets(value: unknown): SavedPromptFacets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;

  const facets: SavedPromptFacets = {};
  const frqType = pick(AP_ENGLISH_LANG_FRQ_TYPES, raw.frqType);
  if (frqType) facets.frqType = frqType;
  const difficulty = pick(AP_ENGLISH_LANG_DIFFICULTIES, raw.difficulty);
  if (difficulty) facets.difficulty = difficulty;

  if (typeof raw.focusSkill === 'string') {
    const focusSkill = raw.focusSkill.trim().slice(0, 80);
    if (focusSkill.length > 0) facets.focusSkill = focusSkill;
  }

  return facets;
}

type SavedPromptRow = {
  id: string;
  title: string;
  prompt: string;
  facets: unknown;
  createdAt: Date;
};

function toSavedPrompt(row: SavedPromptRow): SavedApEnglishLangPrompt {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    savedAt: row.createdAt.toISOString(),
    facets: sanitizeFacets(row.facets),
  };
}

export async function saveApEnglishLangPrompt(params: {
  membershipId: string;
  assignmentTypeId: string;
  title: string;
  prompt: string;
  facets: SavedPromptFacets;
  source?: string;
}): Promise<SavedApEnglishLangPrompt> {
  const prompt = params.prompt.trim();
  if (prompt.length === 0) {
    throw new SavedPromptError('A prompt is required.');
  }
  if (prompt.length > MAX_SAVED_PROMPT_LENGTH) {
    throw new SavedPromptError('That prompt is too long to save.');
  }

  const title =
    params.title.trim().slice(0, MAX_SAVED_PROMPT_TITLE_LENGTH) ||
    FALLBACK_TITLE;
  const facets = sanitizeFacets(params.facets);
  const promptHash = hashPromptText(prompt);
  const source = params.source ?? SAVED_PROMPT_SOURCE_GENERATOR;

  const row = await prisma.savedApEnglishLangPrompt.upsert({
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
      title,
      prompt,
      promptHash,
      facets,
      source,
    },
    // Re-saving refreshes the tags and restores anything previously removed.
    update: { title, facets, archivedAt: null },
    select: { id: true, title: true, prompt: true, facets: true, createdAt: true },
  });

  return toSavedPrompt(row);
}

export async function listSavedApEnglishLangPrompts(params: {
  membershipId: string;
  assignmentTypeId: string;
}): Promise<SavedApEnglishLangPrompt[]> {
  const rows = await prisma.savedApEnglishLangPrompt.findMany({
    where: {
      membershipId: params.membershipId,
      assignmentTypeId: params.assignmentTypeId,
      archivedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, prompt: true, facets: true, createdAt: true },
  });

  return rows.map(toSavedPrompt);
}

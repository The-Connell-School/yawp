// "My prompts": the thesis-driven essay prompts a teacher generated and kept.
//
// Prompts drafted by the LLM generator are saved here — explicitly with "Save
// prompt", and implicitly whenever the teacher uses one to start an assignment
// — so they show up in the Prompt Library under the "My prompts" filter next to
// the fixed corpus. Saves are keyed by a hash of the prompt body so saving and
// then using the same draft leaves exactly one row.

import { createHash } from 'node:crypto';
import type { SavedThesisPrompt } from '~/routes/app.assignment-types.$id/thesis-prompts-library/data';
import { prisma } from '~/utils/db.server';

export const MAX_SAVED_PROMPT_TITLE_LENGTH = 200;
export const MAX_SAVED_PROMPT_BODY_LENGTH = 8000;

/** Where a saved prompt came from. Only the generator writes today. */
export const SAVED_PROMPT_SOURCE_GENERATOR = 'generator';

const FALLBACK_TITLE = 'Untitled prompt';

/** A save the caller got wrong (empty or implausibly long body). */
export class SavedPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SavedPromptError';
  }
}

/**
 * Stable identity for a prompt body, ignoring surrounding whitespace. Hashed
 * because the body is far too long to index directly.
 */
export function hashPromptBody(body: string): string {
  return createHash('sha256').update(body.trim()).digest('hex');
}

type SavedPromptRow = {
  id: string;
  title: string;
  prompt: string;
  createdAt: Date;
};

function toSavedPrompt(row: SavedPromptRow): SavedThesisPrompt {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    savedAt: row.createdAt.toISOString(),
  };
}

export async function saveThesisPrompt(params: {
  membershipId: string;
  assignmentTypeId: string;
  title: string;
  prompt: string;
  source?: string;
}): Promise<SavedThesisPrompt> {
  const prompt = params.prompt.trim();
  if (prompt.length === 0) {
    throw new SavedPromptError('A prompt is required.');
  }
  if (prompt.length > MAX_SAVED_PROMPT_BODY_LENGTH) {
    throw new SavedPromptError('That prompt is too long to save.');
  }

  const title =
    params.title.trim().slice(0, MAX_SAVED_PROMPT_TITLE_LENGTH) ||
    FALLBACK_TITLE;
  const promptHash = hashPromptBody(prompt);
  const source = params.source ?? SAVED_PROMPT_SOURCE_GENERATOR;

  const row = await prisma.savedThesisPrompt.upsert({
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
      source,
    },
    // Re-saving refreshes the title and restores anything previously removed.
    update: { title, archivedAt: null },
    select: { id: true, title: true, prompt: true, createdAt: true },
  });

  return toSavedPrompt(row);
}

export async function listSavedThesisPrompts(params: {
  membershipId: string;
  assignmentTypeId: string;
}): Promise<SavedThesisPrompt[]> {
  const rows = await prisma.savedThesisPrompt.findMany({
    where: {
      membershipId: params.membershipId,
      assignmentTypeId: params.assignmentTypeId,
      archivedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, prompt: true, createdAt: true },
  });

  return rows.map(toSavedPrompt);
}

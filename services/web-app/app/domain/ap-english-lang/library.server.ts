import type { Prisma } from '@app/prisma';
import { DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL } from '~/domain/grading/grading-assistant-strictness';
import { prisma } from '~/utils/db.server';
import {
  AP_ENGLISH_LANG_ASSIGNMENT_TYPE_KEY,
  buildApEnglishLangSnapshot,
} from './schema';
import { hashPromptText, sanitizeFacets } from './saved-prompts.server';

export async function findApEnglishLangAssignmentTypeForOrg(
  organizationId: string,
) {
  return prisma.assignmentType.findFirst({
    where: {
      systemKey: AP_ENGLISH_LANG_ASSIGNMENT_TYPE_KEY,
      archivedAt: null,
      organizationAssignments: { some: { organizationId } },
    },
    select: { id: true, title: true, systemKey: true },
  });
}

export async function listApEnglishLangLibraryEntries(assignmentTypeId: string) {
  return prisma.apEnglishLangPromptLibraryEntry.findMany({
    where: { assignmentTypeId, archivedAt: null },
    orderBy: [{ frqType: 'asc' }, { title: 'asc' }],
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

export async function getApEnglishLangLibraryEntryForSnapshot(params: {
  assignmentTypeId: string;
  externalKey: string;
}) {
  return prisma.apEnglishLangPromptLibraryEntry.findFirst({
    where: {
      assignmentTypeId: params.assignmentTypeId,
      externalKey: params.externalKey,
      archivedAt: null,
    },
    include: { sources: { orderBy: { position: 'asc' } } },
  });
}

/**
 * Timing for a generated prompt. The generator only drafts Q3 argument
 * prompts, and the exam allots 40 minutes for Q3 — the same defaults every
 * curated argument entry carries.
 */
const GENERATED_PROMPT_TIME_MODE = 'untimed' as const;
const GENERATED_PROMPT_DURATION_MINUTES = 40;
const GENERATED_PROMPT_FALLBACK_FOCUS_SKILL = 'line-of-reasoning';

/**
 * Look up one of the teacher's own saved prompts so an assignment can be built
 * from it. Scoped by membership as well as assignment type: a saved prompt
 * belongs to the teacher who generated it, and nobody else can assign it.
 */
export async function getSavedApEnglishLangPromptForSnapshot(params: {
  assignmentTypeId: string;
  membershipId: string;
  savedPromptId: string;
}) {
  return prisma.savedApEnglishLangPrompt.findFirst({
    where: {
      id: params.savedPromptId,
      assignmentTypeId: params.assignmentTypeId,
      membershipId: params.membershipId,
      archivedAt: null,
    },
    select: { id: true, title: true, prompt: true, facets: true },
  });
}

/**
 * Build the assignment input for a generated prompt. It goes through the same
 * snapshot builder as a curated entry, so grading and coaching read it exactly
 * the same way — an argument prompt simply ships no sources.
 */
export function buildAssignmentCreateInputFromSavedApEnglishLangPrompt(params: {
  assignmentTypeId: string;
  title: string | null;
  gradingAssistantStrictnessLevel?: string;
  saved: { id: string; title: string; prompt: string; facets: unknown };
}): Omit<
  Prisma.AssignmentUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
> {
  const facets = sanitizeFacets(params.saved.facets);
  const snapshot = buildApEnglishLangSnapshot({
    externalKey: `saved:${params.saved.id}`,
    // The generator drafts argument prompts only; anything else would need
    // source material it is not allowed to invent.
    frqType: 'argument',
    title: params.saved.title,
    prompt: params.saved.prompt,
    focusSkill: facets.focusSkill ?? GENERATED_PROMPT_FALLBACK_FOCUS_SKILL,
    difficulty: facets.difficulty ?? 'developing',
    sources: [],
    suggestedEvidence: null,
    defaultTimeMode: GENERATED_PROMPT_TIME_MODE,
    defaultDurationMinutes: GENERATED_PROMPT_DURATION_MINUTES,
  });

  return {
    assignmentTypeId: params.assignmentTypeId,
    title: params.title ?? params.saved.title,
    prompt: snapshot.prompt,
    gradingAssistantStrictnessLevel:
      params.gradingAssistantStrictnessLevel ??
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
    apEnglishLangSnapshot: snapshot as Prisma.InputJsonValue,
  };
}

/**
 * Build the assignment input for a prompt the teacher typed straight into the
 * assignment form. Treated as a Q3 argument prompt — the only FRQ type that
 * needs no provided source material — so grading and coaching still get a
 * proper snapshot instead of a bare prompt string.
 */
export function buildAssignmentCreateInputFromApEnglishLangPromptText(params: {
  assignmentTypeId: string;
  title: string | null;
  prompt: string;
  gradingAssistantStrictnessLevel?: string;
}): Omit<
  Prisma.AssignmentUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
> {
  const title = params.title ?? 'AP Language Argument';
  const snapshot = buildApEnglishLangSnapshot({
    externalKey: `manual:${hashPromptText(params.prompt)}`,
    frqType: 'argument',
    title,
    prompt: params.prompt,
    focusSkill: GENERATED_PROMPT_FALLBACK_FOCUS_SKILL,
    difficulty: 'developing',
    sources: [],
    suggestedEvidence: null,
    defaultTimeMode: GENERATED_PROMPT_TIME_MODE,
    defaultDurationMinutes: GENERATED_PROMPT_DURATION_MINUTES,
  });

  return {
    assignmentTypeId: params.assignmentTypeId,
    title,
    prompt: snapshot.prompt,
    gradingAssistantStrictnessLevel:
      params.gradingAssistantStrictnessLevel ??
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
    apEnglishLangSnapshot: snapshot as Prisma.InputJsonValue,
  };
}

export function buildAssignmentCreateInputFromApEnglishLangEntry(params: {
  assignmentTypeId: string;
  title: string | null;
  gradingAssistantStrictnessLevel?: string;
  entry: NonNullable<
    Awaited<ReturnType<typeof getApEnglishLangLibraryEntryForSnapshot>>
  >;
}): Omit<
  Prisma.AssignmentUncheckedCreateInput,
  'id' | 'createdAt' | 'updatedAt'
> {
  const snapshot = buildApEnglishLangSnapshot(params.entry);
  return {
    assignmentTypeId: params.assignmentTypeId,
    title: params.title ?? params.entry.title,
    prompt: snapshot.prompt,
    gradingAssistantStrictnessLevel:
      params.gradingAssistantStrictnessLevel ??
      DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
    apEnglishLangSnapshot: snapshot as Prisma.InputJsonValue,
  };
}

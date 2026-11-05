/**
 * Teacher notes, stored (Oct 24 handoff, task 7). The first time the run of
 * show opens, the planner writes notes for every step that has none, in one
 * call, and they are kept; after that the notes are the teacher's.
 */
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { buildLessonPlannerAdmissionPolicy } from '~/utils/lesson-planner/lesson-planner-admission.server';
import { reserveAiRequest } from '~/utils/ai-admission.server';
import { computeIpHash } from '~/utils/ai-usage-log.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { MAX_NOTES, readTeacherNotes, stepsWithoutNotes } from './teacher-notes';
import { TEACHER_NOTES_SYSTEM, writeTeacherNotes } from './write-teacher-notes.server';

const NOTES_DEADLINE_MS = 25_000;
const NOTES_MAX_TOKENS = 4_000;

type NoteStep = { id: string; title: string; minutes: number | null; content: string };

/** A lesson's steps as the notes are written from them, in run-of-show order. */
export function noteSteps(loaded: {
  v3: { timing: { blocks: Array<{ id: string; title: string; minutes: number }> }; steps: Array<{ id: string; content: string }> };
}): NoteStep[] {
  const content = new Map(loaded.v3.steps.map((step) => [step.id, step.content]));
  return loaded.v3.timing.blocks.map((block) => ({
    id: block.id,
    title: block.title,
    minutes: block.minutes,
    content: content.get(block.id) ?? '',
  }));
}

export async function storedTeacherNotes(conversationId: string): Promise<Record<string, string>> {
  const row = await prisma.lessonPlanConversation.findUnique({
    where: { id: conversationId },
    select: { teacherNotes: true },
  });
  return readTeacherNotes(row?.teacherNotes);
}

/** The lesson's notes, writing the missing ones first (one call). */
export async function teacherNotesFor({
  request,
  conversationId,
  title,
  className,
  steps,
}: {
  request: Request;
  conversationId: string;
  title: string;
  className: string | null;
  steps: NoteStep[];
}): Promise<Record<string, string>> {
  const stored = await storedTeacherNotes(conversationId);
  const missing = stepsWithoutNotes(steps, stored);
  if (!missing.length) return stored;
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) return stored;
  const written = await writeTeacherNotes({
    title,
    className,
    steps: missing,
    complete: async (user) => {
      await reserveAiRequest({
        membershipId: access.membership.id,
        organizationId: access.membership.organization.id,
        feature: 'lesson-planner',
        policy: buildLessonPlannerAdmissionPolicy(access.membership.organization.numOfTeacherSeats),
        units: 1,
      });
      return getLLMCompletion({
        model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
        system: TEACHER_NOTES_SYSTEM,
        messages: [{ role: AgentType.User, content: user }],
        maxTokens: NOTES_MAX_TOKENS,
        attribution: {
          organizationId: access.membership.organization.id,
          membershipId: access.membership.id,
          route: 'routes/show.$conversationId',
          requestId: crypto.randomUUID(),
          ipHash: computeIpHash(request),
        },
        allowFallbackProvider: false,
        signal: AbortSignal.timeout(NOTES_DEADLINE_MS),
        logPayload: 'metadata-only',
        metadata: { feature: 'lesson-planner-teacher-notes' },
      });
    },
  });
  if (!written) return stored;
  // Re-read, so an edit saved while the notes were being written wins.
  const merged = { ...written, ...(await storedTeacherNotes(conversationId)) };
  await prisma.lessonPlanConversation.update({ where: { id: conversationId }, data: { teacherNotes: merged } });
  return merged;
}

/** The teacher's edit to one step's notes. */
export async function saveStepNotes({
  conversationId,
  stepId,
  notes,
}: {
  conversationId: string;
  stepId: string;
  notes: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.lessonPlanConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { teacherNotes: true },
    });
    const next = { ...readTeacherNotes(row.teacherNotes), [stepId]: notes.slice(0, MAX_NOTES) };
    await tx.lessonPlanConversation.update({ where: { id: conversationId }, data: { teacherNotes: next } });
  });
}

/**
 * The run-of-show stack page's changes (stack page redesign; Brian's run 3,
 * items 6, 7, 10). Each answers with what Undo needs, and nothing here runs
 * without the stack page redesign flag.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { loadStackV3 } from '~/domain/lesson-planner/load-stack-v3.server';
import {
  addPiecesAt,
  classKeyFor,
  moveStepToTomorrow,
  restoreStackSnapshot,
  setStepMinutes,
  type StackSnapshot,
} from '~/domain/lesson-planner/stack-actions.server';
import { runStackCommand } from '~/domain/lesson-planner/stack-command.server';
import { ensureStudentVersion } from '~/domain/lesson-planner/step-handout.server';
import { clampMinutes } from '~/domain/lesson-planner/stack-timing';

const POST = z
  .object({
    intent: z.enum([
      'set-minutes',
      'apply-fix',
      'undo',
      'set-lesson',
      'unset-lesson',
      'set-details',
      'add-piece',
      'command',
      // Brian's run 3 (item 8): a step written for students, for a handout.
      'student-version',
      // Leave a step out of the handouts, or put it back in.
      'set-handout',
    ]),
    conversationId: z.string().min(1),
    materialId: z.string().min(1).optional(),
    minutes: z.coerce.number().int().min(1).max(240).optional(),
    fix: z.enum(['trim', 'tomorrow']).optional(),
    snapshot: z.string().max(400_000).optional(),
    lessonDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .or(z.literal(''))
      .optional(),
    periodMinutes: z.coerce.number().int().min(10).max(240).optional(),
    messageId: z.string().min(1).optional(),
    materialKeys: z
      .string()
      .max(400)
      .regex(/^[\w:-]{1,8}(,[\w:-]{1,8})*$/)
      .optional(),
    beforeKey: z.string().max(200).optional(),
    line: z.string().trim().min(1).max(600).optional(),
    insertAfter: z.string().max(200).optional(),
    hasHandout: z.enum(['true', 'false']).optional(),
  })
  .strict();

const SNAPSHOT = z.object({
  rows: z.array(z.object({ id: z.string(), conversationId: z.string() }).passthrough()),
  order: z.array(z.string()),
  carryOverIds: z.array(z.string()),
});

function bad(message: string, status = 400) {
  return dataResponse({ error: message }, { status });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.stackV3) return bad('Not found.', 404);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const conversation = await prisma.lessonPlanConversation.findFirst({
    where: { id: data.conversationId, membershipId: access.membership.id, deletedAt: null },
    select: {
      id: true,
      membershipId: true,
      organizationId: true,
      lessonClassLabel: true,
      lessonDate: true,
      periodMinutes: true,
      originClassAssignment: { select: { classId: true } },
    },
  });
  if (!conversation) return bad('Lesson not found.', 404);

  switch (data.intent) {
    case 'set-minutes': {
      if (!data.materialId || !data.minutes) return bad('A step and its minutes are required.');
      const undo = await setStepMinutes(conversation.id, data.materialId, data.minutes);
      return undo ? dataResponse({ ok: true, undo }) : bad('That step is not in this lesson.', 404);
    }

    case 'apply-fix': {
      // Worked out again here, from the stack as it is now: a page that
      // went stale never applies a fix to a stack that no longer needs it.
      const loaded = await loadStackV3({ request, conversationId: conversation.id });
      const fix = loaded?.v3.fixes.find((candidate) => candidate.id === data.fix);
      if (!loaded || !fix) return bad('That fix no longer applies.', 409);
      const materialId = fix.stepId.replace(/^m:/, '');
      const undo =
        fix.id === 'trim'
          ? await setStepMinutes(conversation.id, materialId, fix.toMinutes)
          : await moveStepToTomorrow({
              conversation: {
                id: conversation.id,
                membershipId: conversation.membershipId,
                organizationId: conversation.organizationId,
                lessonDate: conversation.lessonDate,
                classKey: classKeyFor({
                  classId: conversation.originClassAssignment?.classId,
                  lessonClassLabel: conversation.lessonClassLabel,
                }),
              },
              materialId,
            });
      return undo ? dataResponse({ ok: true, undo, fix: fix.id }) : bad('That step is gone.', 409);
    }

    case 'undo': {
      let parsed: StackSnapshot;
      try {
        parsed = SNAPSHOT.parse(JSON.parse(data.snapshot ?? '')) as unknown as StackSnapshot;
      } catch {
        return bad('Nothing to undo.');
      }
      const restored = await restoreStackSnapshot(conversation.id, parsed);
      return restored ? dataResponse({ ok: true }) : bad('Nothing to undo.');
    }

    case 'set-lesson':
    case 'unset-lesson': {
      await prisma.lessonPlanConversation.update({
        where: { id: conversation.id },
        data: { setAt: data.intent === 'set-lesson' ? new Date() : null },
      });
      return dataResponse({ ok: true });
    }

    case 'set-details': {
      await prisma.lessonPlanConversation.update({
        where: { id: conversation.id },
        data: {
          ...(data.lessonDate !== undefined
            ? { lessonDate: data.lessonDate ? new Date(`${data.lessonDate}T12:00:00.000Z`) : null }
            : {}),
          ...(data.periodMinutes ? { periodMinutes: clampMinutes(data.periodMinutes) } : {}),
        },
      });
      return dataResponse({ ok: true });
    }

    case 'add-piece': {
      if (!data.messageId || !data.materialKeys) return bad('A piece is required.');
      const message = await prisma.lessonPlanMessage.findFirst({
        where: { id: data.messageId, conversationId: conversation.id, role: 'assistant' },
        select: { id: true, createdAt: true, content: true },
      });
      if (!message) return bad('That piece is not part of this lesson.', 404);
      const result = await addPiecesAt({
        conversationId: conversation.id,
        message,
        keys: data.materialKeys.split(','),
        beforeKey: data.beforeKey || null,
      });
      return dataResponse({ ok: true, ...result });
    }

    case 'student-version': {
      if (!data.materialId) return bad('A step is required.');
      try {
        const version = await ensureStudentVersion({
          request,
          access,
          conversationId: conversation.id,
          materialId: data.materialId,
        });
        return version
          ? dataResponse({ ok: true, materialId: data.materialId, content: version.content })
          : bad('That step is not in this lesson.', 404);
      } catch {
        return bad('The student version did not come back. Try again.', 503);
      }
    }

    case 'set-handout': {
      if (!data.materialId || !data.hasHandout) return bad('A step is required.');
      await prisma.lessonPlanMaterial.updateMany({
        where: { id: data.materialId, conversationId: conversation.id },
        data: { hasHandout: data.hasHandout === 'true' },
      });
      return dataResponse({ ok: true });
    }

    case 'command': {
      if (!data.line) return bad('Say what to change.');
      const loaded = await loadStackV3({ request, conversationId: conversation.id });
      if (!loaded) return bad('Not found.', 404);
      const steps = loaded.v3.timing.blocks.map((block) => ({
        id: block.id,
        title: block.title,
        type: block.type,
        minutes: block.minutes,
        isWriting: block.isWriting,
      }));
      const outcome = await runStackCommand({
        request,
        access,
        conversationId: conversation.id,
        line: data.line,
        steps,
        contentById: Object.fromEntries(loaded.v3.steps.map((step) => [step.id, step.content])),
        periodMinutes: conversation.periodMinutes,
        insertAfter: data.insertAfter ?? null,
      });
      return dataResponse({ ok: true, ...outcome });
    }
  }
}

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
import { adminExtras, parseShareItems, SHARE_AUDIENCES } from '~/domain/lesson-planner/lesson-share';
import {
  createShareLink,
  emailLessonLink,
  revokeShareLinks,
  rewriteForAudience,
} from '~/domain/lesson-planner/lesson-share.server';
import { getDomainUrl } from '~/utils/misc';
import { slotsFromSteps, templateDaysFromFramework } from '~/domain/lesson-planner/lesson-templates';
import { frameworkFromDays, multiDayTitle, readPlanDays } from '~/domain/lesson-planner/plan-days';

/** Sends a lesson can make in a day: enough for a sub, a family and an admin. */
const MAX_SENDS_PER_DAY = 20;
import { clampMinutes } from '~/domain/lesson-planner/stack-timing';
import { MAX_LESSON_NAME } from '~/domain/lesson-planner/lesson-rename';
import { renameLesson } from '~/domain/lesson-planner/lesson-rename.server';
import { MAX_NOTES } from '~/domain/lesson-planner/teacher-notes';
import { MAX_EXTENSIONS, readExtensionIds } from '~/domain/lesson-planner/extensions';
import { noteSteps, saveStepNotes, teacherNotesFor } from '~/domain/lesson-planner/teacher-notes.server';
import { STEP_TYPE_LABELS } from '~/domain/lesson-planner/step-types';

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
      // Post to your class and Send this lesson (stack page redesign).
      'create-share',
      'send-lesson',
      'revoke-share',
      // Save this shape as a template (stack page redesign).
      'save-template',
      // Save a week's days as a framework (Brian's run 5, round 2).
      'save-framework',
      // Rename the lesson (Oct 24 handoff, task 8).
      'rename-lesson',
      // The teacher's notes for one step, saved as they type (task 7).
      'set-notes',
      // Write the notes not written yet, in the background (Kevin, Oct 25, note 12c).
      'write-notes',
      // Set a step aside for extra time, or bring it back (note 8c).
      'set-extension',
      // The slides stay as they are though the lesson changed (note 9).
      'keep-deck',
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
    audience: z.enum(SHARE_AUDIENCES).optional(),
    includes: z.string().max(200).optional(),
    recipient: z.string().trim().email().max(200).optional(),
    note: z.string().trim().max(2_000).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    /** `rename-lesson`: the lesson's new name. */
    title: z.string().trim().min(1).max(MAX_LESSON_NAME).optional(),
    /** `set-notes`: the step, and its notes as the teacher left them. */
    stepId: z.string().min(1).max(200).optional(),
    notes: z.string().max(MAX_NOTES).optional(),
    /** `set-extension`: into the extensions, or back into the lesson. */
    extension: z.enum(['true', 'false']).optional(),
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
      extensionStepIds: true,
      originClassAssignment: { select: { classId: true } },
    },
  });
  if (!conversation) return bad('Lesson not found.', 404);

  switch (data.intent) {
    case 'rename-lesson': {
      if (!flags.teachNotes) return bad('Not found.', 404);
      if (!data.title) return bad('A name is required.');
      const renamed = await renameLesson({ conversationId: conversation.id, membershipId: access.membership.id, name: data.title });
      return renamed ? dataResponse({ ok: true, ...renamed }) : bad('A name is required.');
    }

    case 'set-notes': {
      if (!flags.teachNotes) return bad('Not found.', 404);
      if (!data.stepId) return bad('A step is required.');
      await saveStepNotes({ conversationId: conversation.id, stepId: data.stepId, notes: data.notes ?? '' });
      return dataResponse({ ok: true });
    }

    case 'write-notes': {
      if (!flags.teachNotes) return bad('Not found.', 404);
      const loaded = await loadStackV3({ request, conversationId: conversation.id });
      if (!loaded) return bad('Not found.', 404);
      const notes = await teacherNotesFor({
        request,
        conversationId: conversation.id,
        title: loaded.packet.title,
        className: loaded.packet.className,
        steps: noteSteps(loaded),
      });
      return dataResponse({ ok: true, notes });
    }

    case 'set-extension': {
      if (!flags.teachNotes) return bad('Not found.', 404);
      if (!data.stepId || !data.extension) return bad('A step is required.');
      const current = readExtensionIds(conversation.extensionStepIds).filter((id) => id !== data.stepId);
      const next = data.extension === 'true' ? [...current, data.stepId].slice(-MAX_EXTENSIONS) : current;
      await prisma.lessonPlanConversation.update({
        where: { id: conversation.id },
        data: { extensionStepIds: next },
      });
      return dataResponse({ ok: true, extension: data.extension === 'true' ? data.stepId : null });
    }

    case 'keep-deck': {
      if (!flags.teachNotes) return bad('Not found.', 404);
      // Cleared, the next load stores the deck with the lesson as it is now.
      await prisma.lessonPlanConversation.update({ where: { id: conversation.id }, data: { deckStackKey: null } });
      return dataResponse({ ok: true });
    }

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
      // Set: the notes start being written now, so they're ready when the
      // teacher opens them (note 12c). Not waited on.
      if (data.intent === 'set-lesson' && flags.teachNotes) {
        void loadStackV3({ request, conversationId: conversation.id })
          .then((loaded) =>
            loaded
              ? teacherNotesFor({
                  request,
                  conversationId: conversation.id,
                  title: loaded.packet.title,
                  className: loaded.packet.className,
                  steps: noteSteps(loaded),
                })
              : null
          )
          .catch(() => null);
      }
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

    case 'create-share': {
      if (!flags.share) return bad('Not found.', 404);
      const includes = parseShareItems(data.includes);
      if (!includes.length) return bad('Pick what the link opens.');
      // One student link per lesson at a time: posting again replaces it.
      await revokeShareLinks(conversation.id, 'student');
      const { token } = await createShareLink({ conversationId: conversation.id, audience: 'student', includes });
      return dataResponse({ ok: true, url: `${getDomainUrl(request)}/l/${token}` });
    }

    case 'revoke-share': {
      if (!flags.share) return bad('Not found.', 404);
      await revokeShareLinks(conversation.id, data.audience);
      return dataResponse({ ok: true });
    }

    case 'send-lesson': {
      if (!flags.share) return bad('Not found.', 404);
      if (!data.audience || !data.recipient) return bad('Who should it go to?');
      const sentToday = await prisma.lessonShareLink.count({
        where: {
          audience: { not: 'student' },
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          conversation: { membershipId: access.membership.id },
        },
      });
      if (sentToday >= MAX_SENDS_PER_DAY) return bad('That is enough sends today.', 429);
      const includes = parseShareItems(data.includes);
      const loaded = await loadStackV3({ request, conversationId: conversation.id });
      if (!loaded) return bad('Not found.', 404);
      const needsText = includes.some((item) => ['plan', 'summary', 'help'].includes(item));
      const rewritten = needsText
        ? await rewriteForAudience({
            request,
            access,
            audience: data.audience,
            title: loaded.packet.title,
            className: loaded.packet.className,
            steps: loaded.v3.timing.blocks.map((block) => {
              const step = loaded.v3.steps.find((entry) => entry.id === block.id)!;
              return {
                title: block.title,
                // Each step by its type, as the stack labels it (Brian's round 4, item 4).
                type: step.writingName ?? STEP_TYPE_LABELS[step.type],
                minutes: block.minutes,
                startsAt: block.startsAt,
                excerpt: step.excerpt,
                content: step.content,
              };
            }),
          })
        : null;
      // The standards the teacher named and an invitation to observe: added
      // here, in their own terms, never written by the model.
      const extras =
        data.audience === 'admin'
          ? adminExtras({
              standards: includes.includes('standards') ? loaded.v3.standards : null,
              observe: includes.includes('observe'),
              className: loaded.packet.className,
              lessonDate: loaded.v3.lessonDate,
            })
          : '';
      const body = [rewritten, extras].filter(Boolean).join('\n\n') || null;
      const { token } = await createShareLink({
        conversationId: conversation.id,
        audience: data.audience,
        includes,
        note: data.note || null,
        body,
      });
      const url = `${getDomainUrl(request)}/l/${token}`;
      const teacher = await prisma.user.findUnique({ where: { id: access.userId }, select: { name: true } });
      const { delivery } = await emailLessonLink({
        to: data.recipient,
        audience: data.audience,
        title: loaded.packet.title,
        className: loaded.packet.className,
        link: url,
        note: data.note || null,
        teacherName: teacher?.name ?? null,
        observe: data.audience === 'admin' && includes.includes('observe'),
      });
      // Sent, a preview (no email goes out), or failed: the page says which.
      return dataResponse({ ok: true, url, sentTo: data.recipient, delivery });
    }

    case 'save-template': {
      if (!flags.templates) return bad('Not found.', 404);
      if (!data.name) return bad('Name the template.');
      const loaded = await loadStackV3({ request, conversationId: conversation.id });
      if (!loaded?.v3.timing.blocks.length) return bad('There is nothing in this lesson to save.');
      // The order and timing, never the content.
      const template = await prisma.lessonPlanTemplate.create({
        data: {
          name: data.name,
          slots: slotsFromSteps(
            loaded.v3.timing.blocks.map((block) => ({
              ...block,
              label: loaded.v3.steps.find((step) => step.id === block.id)?.label ?? null,
            }))
          ),
          periodMinutes: conversation.periodMinutes,
          membershipId: access.membership.id,
          organizationId: access.membership.organization.id,
        },
        select: { id: true },
      });
      return dataResponse({ ok: true, templateId: template.id });
    }

    case 'save-framework': {
      if (!flags.templates) return bad('Not found.', 404);
      const message = data.messageId
        ? await prisma.lessonPlanMessage.findFirst({
            where: { id: data.messageId, conversationId: conversation.id, role: 'assistant' },
            select: { id: true, content: true },
          })
        : null;
      const days = message ? readPlanDays(message.content) : [];
      const templateDays = message ? templateDaysFromFramework(frameworkFromDays(days, message.id)) : [];
      if (!message || templateDays.length < 2) return bad('That reply is not a plan of several days.');
      // The week's shape, never its words: each day's steps by type and minutes.
      const template = await prisma.lessonPlanTemplate.create({
        data: {
          name: (data.name || multiDayTitle(message.content, days)).slice(0, 120),
          slots: templateDays[0]!.slots,
          days: templateDays,
          periodMinutes: conversation.periodMinutes,
          membershipId: access.membership.id,
          organizationId: access.membership.organization.id,
        },
        select: { id: true },
      });
      return dataResponse({ ok: true, templateId: template.id });
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

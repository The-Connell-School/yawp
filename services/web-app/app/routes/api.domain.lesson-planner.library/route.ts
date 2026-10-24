/**
 * The library's moves (Oct 24 handoff, Part 2): units, groups and lessons.
 * Every answer carries the line for the status bar and its Undo.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import {
  createGroup,
  createUnit,
  deleteUnit,
  duplicateLesson,
  duplicateUnit,
  groupUnits,
  LIBRARY_UNDO,
  moveGroup,
  moveLessonTo,
  moveUnitsToGroup,
  planLesson,
  renameGroup,
  renameUnit,
  undoLibrary,
  ungroup,
} from '~/domain/lesson-planner/library-v2.server';

const ID = z.string().min(1).max(64);
const POST = z
  .object({
    intent: z.enum([
      'create-unit',
      'rename-unit',
      'delete-unit',
      'duplicate-unit',
      'move-units',
      'group-units',
      'create-group',
      'rename-group',
      'move-group',
      'ungroup',
      'move-lesson',
      'plan-lesson',
      'duplicate-lesson',
      'undo',
    ]),
    courseId: ID.optional(),
    unitId: z.string().max(64).optional(),
    /** Comma-separated unit ids. */
    unitIds: z.string().max(4000).regex(/^[\w-]+(,[\w-]+)*$/).optional(),
    groupId: z.string().max(64).optional(),
    conversationId: ID.optional(),
    title: z.string().max(200).optional(),
    subtitle: z.string().max(200).optional(),
    kind: z.string().max(20).optional(),
    direction: z.enum(['up', 'down']).optional(),
    /** Where a lesson goes in its unit: 0 is Day 1. */
    index: z.coerce.number().int().min(0).max(500).optional(),
    undo: z.string().max(500_000).optional(),
  })
  .strict();

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.libraryV2) return dataResponse({ error: 'Not found.' }, { status: 404 });
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);
  const scope = { membershipId: access.membership.id, organizationId: access.membership.organization.id };
  const unitIds = (data.unitIds ?? '').split(',').filter(Boolean);
  const answer = (done: { result: Record<string, unknown>; undo: unknown } | null) =>
    done ? dataResponse({ ok: true, ...done.result, undo: JSON.stringify(done.undo) }) : dataResponse({ error: 'Not found.' }, { status: 404 });
  const bad = (message: string) => dataResponse({ error: message }, { status: 400 });

  switch (data.intent) {
    case 'create-unit':
      if (!data.courseId) return bad('A course is required.');
      return answer(await createUnit(scope, { courseId: data.courseId, title: data.title ?? '', kind: data.kind ?? 'texts', groupId: data.groupId || null }));
    case 'rename-unit':
      return data.unitId ? answer(await renameUnit(scope, data.unitId, data.title ?? '')) : bad('A unit is required.');
    case 'delete-unit':
      return data.unitId ? answer(await deleteUnit(scope, data.unitId)) : bad('A unit is required.');
    case 'duplicate-unit':
      return data.unitId ? answer(await duplicateUnit(scope, data.unitId)) : bad('A unit is required.');
    case 'move-units':
      return unitIds.length ? answer(await moveUnitsToGroup(scope, unitIds, data.groupId || null)) : bad('Pick a unit.');
    case 'group-units':
      return unitIds.length ? answer(await groupUnits(scope, unitIds, data.title ?? '')) : bad('Pick a unit.');
    case 'create-group':
      return data.courseId ? answer(await createGroup(scope, data.courseId, data.title ?? '')) : bad('A course is required.');
    case 'rename-group':
      return data.groupId ? answer(await renameGroup(scope, data.groupId, data.title ?? '', data.subtitle ?? null)) : bad('A group is required.');
    case 'move-group':
      return data.groupId && data.direction ? answer(await moveGroup(scope, data.groupId, data.direction)) : bad('A group is required.');
    case 'ungroup':
      return data.groupId ? answer(await ungroup(scope, data.groupId)) : bad('A group is required.');
    case 'move-lesson':
      return data.conversationId
        ? answer(await moveLessonTo(scope, data.conversationId, data.unitId || null, data.index ?? null))
        : bad('A lesson is required.');
    case 'plan-lesson':
      // With a course and a title: a new unit, made here, for the lesson (L3, "New unit…").
      return answer(
        await planLesson(scope, {
          unitId: data.unitId || null,
          index: data.index ?? null,
          newUnit: !data.unitId && data.courseId && data.title ? { courseId: data.courseId, title: data.title } : null,
        })
      );
    case 'duplicate-lesson':
      return data.conversationId ? answer(await duplicateLesson(scope, data.conversationId)) : bad('A lesson is required.');
    case 'undo': {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(data.undo ?? '');
      } catch {
        // Refused below.
      }
      const undo = LIBRARY_UNDO.safeParse(parsed);
      if (!undo.success) return bad('That can’t be undone.');
      await undoLibrary(scope, undo.data);
      return dataResponse({ ok: true, message: 'Undone.' });
    }
  }
}

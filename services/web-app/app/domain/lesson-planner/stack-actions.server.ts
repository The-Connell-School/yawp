/**
 * What the run-of-show stack page changes (stack page redesign; Brian's run
 * 3, items 6, 7, 10): a step's minutes, the two one-tap fixes, a chat line
 * that changes the stack, adding a piece where the teacher points, and Undo
 * for every one of them.
 *
 * Undo is a snapshot of the rows a change touched and the order before it,
 * handed back to the page and returned to restore. Nothing is kept on the
 * server for it, and every restore is checked against this lesson.
 */
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { fileReplyPieces } from './file-reply-pieces.server';
import { loadStackOrder, writeStackOrder } from './stack-order.server';
import type { StackOp } from './stack-command';
import { clampMinutes } from './stack-timing';

const ROW = {
  id: true,
  conversationId: true,
  sourceMessageId: true,
  sourceCreatedAt: true,
  blockKey: true,
  slot: true,
  kind: true,
  title: true,
  audience: true,
  content: true,
  editedAt: true,
  position: true,
  promptId: true,
  minutes: true,
  stepType: true,
  label: true,
  hasHandout: true,
  yawpAssignmentId: true,
  yawpHref: true,
  yawpCreatedAt: true,
} as const;

type Row = Prisma.LessonPlanMaterialGetPayload<{ select: typeof ROW }>;

export type StackSnapshot = {
  rows: Row[];
  order: string[];
  /** Carry-overs a change made, which Undo takes back. */
  carryOverIds: string[];
};

const TITLE_MINUTES = /\s*\(\s*\d+[^)]*min[^)]*\)\s*$/i;

/** The title with its minutes, for the stack v2 page that still reads them there. */
export function titleWithMinutes(title: string, minutes: number): string {
  return `${title.replace(TITLE_MINUTES, '').trim()} (${minutes} min)`;
}

async function snapshot(conversationId: string, ids: string[]): Promise<StackSnapshot> {
  const [rows, order] = await Promise.all([
    prisma.lessonPlanMaterial.findMany({ where: { conversationId, id: { in: ids } }, select: ROW }),
    loadStackOrder(conversationId),
  ]);
  return { rows, order, carryOverIds: [] };
}

export async function setStepMinutes(
  conversationId: string,
  materialId: string,
  minutes: number
): Promise<StackSnapshot | null> {
  const before = await snapshot(conversationId, [materialId]);
  const row = before.rows[0];
  if (!row) return null;
  const clamped = clampMinutes(minutes);
  await prisma.lessonPlanMaterial.updateMany({
    where: { id: materialId, conversationId },
    data: { minutes: clamped, title: titleWithMinutes(row.title, clamped) },
  });
  return before;
}

/** The changes a stack chat line asked for, all or none. */
export async function applyStackOps(
  conversationId: string,
  ops: StackOp[]
): Promise<StackSnapshot> {
  const ids = [...new Set(ops.map((op) => op.stepId))];
  const before = await snapshot(conversationId, ids);
  const rows = new Map(before.rows.map((row) => [row.id, row]));
  let order = [...before.order];
  await prisma.$transaction(async (tx) => {
    for (const op of ops) {
      const row = rows.get(op.stepId);
      if (!row) continue;
      const where = { id: op.stepId, conversationId };
      if (op.op === 'set_minutes') {
        const minutes = clampMinutes(op.minutes);
        await tx.lessonPlanMaterial.updateMany({
          where,
          data: { minutes, title: titleWithMinutes(row.title, minutes) },
        });
      } else if (op.op === 'rename') {
        const minutes = row.minutes;
        await tx.lessonPlanMaterial.updateMany({
          where,
          data: { title: minutes != null ? titleWithMinutes(op.title, minutes) : op.title.trim() },
        });
      } else if (op.op === 'rewrite_step') {
        // The teacher asked for this change, so it is their edit: the next
        // version the planner files does not silently replace it.
        await tx.lessonPlanMaterial.updateMany({
          where,
          data: { content: op.content.trim(), editedAt: new Date() },
        });
      } else if (op.op === 'remove') {
        await tx.lessonPlanMaterial.deleteMany({ where });
        order = order.filter((key) => key !== `m:${op.stepId}`);
      } else if (op.op === 'move') {
        const key = `m:${op.stepId}`;
        const rest = order.filter((entry) => entry !== key);
        rest.splice(Math.min(op.toIndex, rest.length), 0, key);
        order = rest;
      }
    }
  });
  if (ops.some((op) => op.op === 'move')) await writeStackOrder(conversationId, order);
  return before;
}

/** Normalized, so "English 10 · Period 3" and "english 10 - period 3" meet. */
export function classKeyFor(conversation: {
  classId?: string | null;
  lessonClassLabel?: string | null;
}): string {
  if (conversation.classId) return `class:${conversation.classId}`;
  const label = conversation.lessonClassLabel?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return label ? `label:${label}` : 'any';
}

/**
 * Fix 2: a Context step moves to tomorrow. It leaves this stack and waits,
 * keyed by the class, at the top of the next lesson for that class.
 */
export async function moveStepToTomorrow({
  conversation,
  materialId,
}: {
  conversation: {
    id: string;
    membershipId: string;
    organizationId: string;
    classKey: string;
    lessonDate: Date | null;
  };
  materialId: string;
}): Promise<StackSnapshot | null> {
  const before = await snapshot(conversation.id, [materialId]);
  const row = before.rows[0];
  if (!row) return null;
  const carry = await prisma.$transaction(async (tx) => {
    const created = await tx.lessonPlanCarryOver.create({
      data: {
        classKey: conversation.classKey,
        fromConversationId: conversation.id,
        fromLessonDate: conversation.lessonDate,
        kind: row.kind,
        title: row.title,
        content: row.content,
        minutes: row.minutes,
        stepType: row.stepType,
        membershipId: conversation.membershipId,
        organizationId: conversation.organizationId,
      },
      select: { id: true },
    });
    await tx.lessonPlanMaterial.deleteMany({ where: { id: materialId, conversationId: conversation.id } });
    return created;
  });
  return { ...before, carryOverIds: [carry.id] };
}

/** Put back exactly what a change touched. */
export async function restoreStackSnapshot(
  conversationId: string,
  saved: StackSnapshot
): Promise<boolean> {
  // Every row must be this lesson's, whatever the page sent back.
  if (saved.rows.some((row) => row.conversationId !== conversationId)) return false;
  await prisma.$transaction(async (tx) => {
    for (const row of saved.rows) {
      const { id, conversationId: _conversation, ...fields } = row;
      const data = {
        ...fields,
        sourceCreatedAt: new Date(fields.sourceCreatedAt),
        editedAt: fields.editedAt ? new Date(fields.editedAt) : null,
        yawpCreatedAt: fields.yawpCreatedAt ? new Date(fields.yawpCreatedAt) : null,
      };
      const existing = await tx.lessonPlanMaterial.findUnique({ where: { id }, select: { conversationId: true } });
      if (existing && existing.conversationId !== conversationId) continue;
      if (existing) await tx.lessonPlanMaterial.update({ where: { id }, data });
      else await tx.lessonPlanMaterial.create({ data: { id, conversationId, ...data } });
    }
    if (saved.carryOverIds.length) {
      await tx.lessonPlanCarryOver.deleteMany({
        where: { id: { in: saved.carryOverIds }, fromConversationId: conversationId, consumedAt: null },
      });
    }
  });
  const known = new Set(await loadStackOrder(conversationId));
  await writeStackOrder(
    conversationId,
    saved.order.filter((key) => known.has(key))
  );
  return true;
}

/**
 * The steps moved to tomorrow for this class wait at the top of its next
 * lesson: any lesson for the class started after they were moved.
 */
export async function claimCarryOvers(conversation: {
  id: string;
  createdAt: Date;
  membershipId: string;
  classKey: string;
}): Promise<number> {
  const waiting = await prisma.lessonPlanCarryOver.findMany({
    where: {
      membershipId: conversation.membershipId,
      classKey: { in: [conversation.classKey, 'any'] },
      consumedAt: null,
      fromConversationId: { not: conversation.id },
      createdAt: { lt: conversation.createdAt },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!waiting.length) return 0;
  const newKeys: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const carry of waiting) {
      const claimed = await tx.lessonPlanCarryOver.updateMany({
        where: { id: carry.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (!claimed.count) continue;
      const created = await tx.lessonPlanMaterial.create({
        data: {
          conversationId: conversation.id,
          sourceMessageId: `carry:${carry.id}`,
          sourceCreatedAt: conversation.createdAt,
          blockKey: 'carry',
          slot: `carry:${carry.id}`,
          kind: carry.kind,
          title: carry.title,
          audience: 'teacher',
          content: carry.content,
          minutes: carry.minutes,
          stepType: carry.stepType,
          label: carry.fromLessonDate
            ? `Moved from ${carry.fromLessonDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}`
            : 'Moved from your last lesson',
        },
        select: { id: true },
      });
      newKeys.push(`m:${created.id}`);
    }
  });
  if (newKeys.length) {
    const rest = (await loadStackOrder(conversation.id)).filter((key) => !newKeys.includes(key));
    await writeStackOrder(conversation.id, [...newKeys, ...rest]);
  }
  return newKeys.length;
}

/**
 * Pieces from the conversation, filed where the teacher pointed: before
 * `beforeKey`, or at the end. Returns the new stack keys, in order.
 */
export async function addPiecesAt({
  conversationId,
  message,
  keys,
  beforeKey,
}: {
  conversationId: string;
  message: { id: string; createdAt: Date; content: string };
  keys: string[];
  beforeKey: string | null;
}): Promise<{ added: string[]; keys: string[] }> {
  const beforeOrder = await loadStackOrder(conversationId);
  const result = await fileReplyPieces({ conversationId, message, onlyKeys: keys });
  const after = await loadStackOrder(conversationId);
  const fresh = after.filter((key) => !beforeOrder.includes(key));
  if (!fresh.length) return { added: result.added, keys: [] };
  const rest = after.filter((key) => !fresh.includes(key));
  const at = beforeKey ? rest.indexOf(beforeKey) : -1;
  const order = at >= 0 ? [...rest.slice(0, at), ...fresh, ...rest.slice(at)] : [...rest, ...fresh];
  await writeStackOrder(conversationId, order);
  return { added: result.added, keys: fresh };
}

/**
 * Each lesson's run of show, read the way its stack page reads it, for many
 * lessons at once (Oct 24 handoff, Part 2): the unit tiles' writing meters,
 * the unit view's day bars and the lesson preview's time bar.
 */
import { prisma } from '~/utils/db.server';
import { createdFor, linksByToken } from './assignment-links';
import { buildLessonPacket } from './lesson-packet';
import { stackSections } from './load-lesson-packet.server';
import { stackSteps } from './stack-steps';
import { stackTiming, type StackTiming } from './stack-timing';
import { stepChipText } from './step-types';

export type LessonRun = {
  total: number;
  period: number | null;
  status: string;
  writingMinutes: number;
  writingPercent: number;
  hasHandouts: boolean;
  steps: Array<{ id: string; title: string; chip: string; type: StackTiming['blocks'][number]['type']; minutes: number; startsAt: number; isWriting: boolean }>;
};

export async function lessonRuns(conversationIds: string[], stackV2: boolean): Promise<Record<string, LessonRun>> {
  if (!conversationIds.length) return {};
  const lessons = await prisma.lessonPlanConversation.findMany({
    where: { id: { in: conversationIds } },
    select: {
      id: true,
      title: true,
      packetTitle: true,
      periodMinutes: true,
      messages: {
        where: { keptAt: { not: null }, role: 'assistant' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, createdAt: true, content: true, keptAudience: true, keptTitle: true, position: true },
      },
      assignmentLinks: { select: { sourceMessageId: true, blockKey: true, yawpHref: true, createdFrom: true } },
      materials: {
        orderBy: [{ sourceCreatedAt: 'asc' }, { blockKey: 'asc' }],
        select: {
          id: true,
          sourceCreatedAt: true,
          sourceMessageId: true,
          blockKey: true,
          kind: true,
          title: true,
          audience: true,
          content: true,
          editedAt: true,
          position: true,
          minutes: true,
          stepType: true,
          label: true,
          hasHandout: true,
          yawpAssignmentId: true,
          yawpHref: true,
          yawpCreatedAt: true,
          slot: true,
        },
      },
    },
  });
  return Object.fromEntries(
    lessons.map((lesson) => {
      const links = linksByToken(lesson.assignmentLinks);
      const packet = buildLessonPacket({
        title: lesson.packetTitle ?? lesson.title,
        className: null,
        sections: stackSections({ messages: lesson.messages, materials: lesson.materials, stackV2 }),
      });
      const steps = stackSteps({
        packet,
        materialKinds: Object.fromEntries(lesson.materials.map((material) => [material.id, material.kind])),
        materialMeta: Object.fromEntries(
          lesson.materials.map((material) => [
            material.id,
            {
              stepType: material.stepType,
              label: material.label,
              minutes: material.minutes,
              hasHandout: material.hasHandout,
              yawpAssignmentId: material.yawpAssignmentId,
              yawpCreated: Boolean(createdFor(links, material)),
            },
          ])
        ),
        materialTokens: {},
        stackDetails: {},
      });
      const timing = stackTiming(steps, lesson.periodMinutes);
      const labels = new Map(steps.map((step) => [step.id, step.label]));
      const run: LessonRun = {
        total: timing.total,
        period: timing.period,
        status: timing.status,
        writingMinutes: timing.writingMinutes,
        writingPercent: timing.writingPercent,
        hasHandouts: steps.some((step) => step.hasHandout),
        steps: timing.blocks.map((block) => ({
          id: block.id,
          title: block.title,
          chip: stepChipText(block.type, labels.get(block.id)),
          type: block.type,
          minutes: block.minutes,
          startsAt: block.startsAt,
          isWriting: block.isWriting,
        })),
      };
      return [lesson.id, run];
    })
  );
}

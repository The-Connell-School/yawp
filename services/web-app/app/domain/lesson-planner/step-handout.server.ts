/**
 * A step's student version (Brian's run 3, item 8), written once per version
 * of the step and kept on it, so printing again costs nothing.
 */
import { prisma } from '~/utils/db.server';
import { plannerComplete, type PlannerAccess } from './planner-completion.server';
import { stepTypeFor } from './step-types';
import {
  isStudentFacing,
  STUDENT_VERSION_SYSTEM,
  studentVersionKey,
  studentVersionUserMessage,
} from './step-handout';

export async function ensureStudentVersion({
  request,
  access,
  conversationId,
  materialId,
}: {
  request: Request;
  access: PlannerAccess;
  conversationId: string;
  materialId: string;
}): Promise<{ content: string } | null> {
  const material = await prisma.lessonPlanMaterial.findFirst({
    where: { id: materialId, conversationId },
    select: {
      kind: true,
      title: true,
      content: true,
      minutes: true,
      stepType: true,
      studentVersion: true,
      studentVersionKey: true,
    },
  });
  if (!material) return null;
  if (isStudentFacing(material.kind)) return { content: material.content };
  const key = studentVersionKey(material.content);
  if (material.studentVersion && material.studentVersionKey === key) {
    return { content: material.studentVersion };
  }
  const written = (
    await plannerComplete({
      request,
      access,
      system: STUDENT_VERSION_SYSTEM,
      user: studentVersionUserMessage({
        title: material.title,
        type: stepTypeFor({ kind: material.kind, title: material.title, stored: material.stepType }),
        minutes: material.minutes,
        content: material.content,
      }),
      feature: 'lesson-planner-student-version',
      route: 'routes/api.domain.lesson-planner.stack',
      maxTokens: 900,
    })
  ).trim();
  if (!written) return null;
  await prisma.lessonPlanMaterial.updateMany({
    where: { id: materialId, conversationId },
    data: { studentVersion: written, studentVersionKey: key, hasHandout: true },
  });
  return { content: written };
}

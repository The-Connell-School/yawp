/**
 * The steps a handout can be made from (Brian's run 3, item 8): every step in
 * the stack, with what it prints as and whether it is in by default.
 */
import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { loadStackV3 } from './load-stack-v3.server';
import { answerLinesFor, handoutContent, isStudentFacing, studentVersionKey } from './step-handout';
import type { StackStep } from './stack-steps';
import { handoutKit } from './lesson-pdf.server';

export type HandoutStep = Pick<StackStep, 'id' | 'title' | 'type' | 'label' | 'isWriting' | 'kind'> & {
  /** In the handout unless the teacher takes it out. */
  included: boolean;
  /** Written for students already (as filed, or a current student version). */
  ready: boolean;
  /** Needs a student version written before it can print. */
  needsVersion: boolean;
  content: string | null;
  lines: number;
};

export async function loadStepHandouts({
  request,
  conversationId,
}: {
  request: Request;
  conversationId: string | undefined;
}) {
  const loaded = await loadStackV3({ request, conversationId });
  if (!loaded) throw redirect(`/app/lesson-planner/${conversationId}/packet?view=handout`);
  const versions = await prisma.lessonPlanMaterial.findMany({
    where: { conversationId: loaded.conversationId },
    select: { id: true, content: true, studentVersion: true, studentVersionKey: true },
  });
  const fresh = new Map(
    versions
      .filter((row) => row.studentVersion && row.studentVersionKey === studentVersionKey(row.content))
      .map((row) => [row.id, row.studentVersion!])
  );
  const steps: HandoutStep[] = loaded.v3.steps.map((step) => {
    const content = handoutContent(step, fresh.get(step.id) ?? null);
    return {
      id: step.id,
      title: step.title,
      type: step.type,
      label: step.label,
      isWriting: step.isWriting,
      kind: step.kind,
      included: step.hasHandout,
      ready: content !== null,
      needsVersion: !isStudentFacing(step.kind) && step.origin === 'material',
      content,
      lines: answerLinesFor(step),
    };
  });
  return {
    conversationId: loaded.conversationId,
    title: loaded.packet.title,
    className: loaded.packet.className,
    steps,
    kit: handoutKit(loaded.packet, loaded.reviewFlags),
  };
}

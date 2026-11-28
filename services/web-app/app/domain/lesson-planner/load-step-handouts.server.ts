/**
 * The steps a handout can be made from (Brian's run 3, item 8): every step in
 * the stack, with what it prints as and whether it is in by default.
 */
import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { loadStackV3 } from './load-stack-v3.server';
import {
  answerLinesFor,
  handoutContent,
  handoutPages,
  handoutPlan,
  isStudentFacing,
  studentVersionKey,
  type HandoutPlan,
} from './step-handout';
import type { StackStep } from './stack-steps';
import { handoutKit } from './lesson-pdf.server';
import { ensureStudentVersion } from './step-handout.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';

export type HandoutStep = Pick<StackStep, 'id' | 'title' | 'type' | 'label' | 'isWriting' | 'kind'> & {
  /** In the handout unless the teacher takes it out. */
  included: boolean;
  /** Written for students already (as filed, or a current student version). */
  ready: boolean;
  /** Needs a student version written before it can print. */
  needsVersion: boolean;
  content: string | null;
  lines: number;
  /**
   * Its student task is its own blocks, in the stack too (the class
   * starter's prompts, the closing's exit ticket): out by default, so the
   * packet never prints the task twice (Nov 22 review).
   */
  covered: boolean;
};

export async function loadStepHandouts(args: { request: Request; conversationId: string | undefined }) {
  const { plan, ...handouts } = await readStepHandouts(args);
  void plan;
  return handouts;
}

async function readStepHandouts({
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
  // The replies the steps came from: which steps their own blocks stand for.
  const sourceIds = [
    ...new Set(loaded.v3.steps.flatMap((step) => (step.token ? [step.token.slice(0, step.token.indexOf(':'))] : []))),
  ].filter(Boolean);
  const sources = sourceIds.length
    ? await prisma.lessonPlanMessage.findMany({
        where: { conversationId: loaded.conversationId, id: { in: sourceIds } },
        select: { id: true, content: true },
      })
    : [];
  const plan: HandoutPlan = handoutPlan(
    loaded.v3.steps.map((step) => ({ id: step.id, kind: step.kind, token: step.token })),
    Object.fromEntries(sources.map((source) => [source.id, source.content]))
  );
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
      included: step.hasHandout && !plan.covered.has(step.id),
      covered: plan.covered.has(step.id),
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
    plan,
  };
}

/**
 * The handout's parts for a download: the steps the teacher picked (`ids`),
 * or every step marked with a handout, in stack order. The PDF, the Word file
 * and the Google Doc all print these (Oct 24 handoff, task 4).
 */
export async function loadHandoutParts({
  request,
  conversationId,
}: {
  request: Request;
  conversationId: string | undefined;
}) {
  const { plan, ...handouts } = await readStepHandouts({ request, conversationId });
  const asked = new URL(request.url).searchParams.get('ids');
  const wanted = asked
    ? new Set(asked.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 200))
    : null;
  const picked = handouts.steps.filter((step) => (wanted ? wanted.has(step.id) : step.included));
  // A step not yet written for students is written now, not left out (Kevin,
  // Oct 25, note 11: the handout PDF came back without its steps). Two at a time.
  const missing = picked.filter((step) => !step.content && step.needsVersion);
  if (missing.length) {
    const access = await getLessonPlannerAccess(request);
    for (let index = 0; index < missing.length; index += 2) {
      await Promise.all(
        missing.slice(index, index + 2).map(async (step) => {
          try {
            const version = await ensureStudentVersion({
              request,
              access,
              conversationId: handouts.conversationId,
              materialId: step.id,
            });
            if (version) step.content = version.content;
          } catch {
            // Left out; the handouts page can try again.
          }
        })
      );
    }
  }
  // One page per task: a step's options picked together print as one
  // "choose one" page (Nov 22 review).
  const parts = handoutPages(
    picked
      .filter((step) => step.content)
      // "what Macbeth's first aside reveals…", a ticket named by its topic, starts with a capital on the page.
      .map((step) => ({ id: step.id, title: step.title.charAt(0).toUpperCase() + step.title.slice(1), content: step.content!, lines: step.lines })),
    plan
  );
  return { handouts, parts, wantedOne: Boolean(wanted && wanted.size === 1) };
}

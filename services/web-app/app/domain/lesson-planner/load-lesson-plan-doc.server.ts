/**
 * The concise lesson plan for a lesson (Brian's run 2, D1, D2): the stack,
 * summarized once per version of the stack and kept, so a second download is
 * instant and costs nothing. Only with lesson_planner_plan_export_v2 on.
 */
import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { buildLessonPlannerAdmissionPolicy } from '~/utils/lesson-planner/lesson-planner-admission.server';
import { reserveAiRequest } from '~/utils/ai-admission.server';
import { computeIpHash } from '~/utils/ai-usage-log.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { loadLessonPacket } from './load-lesson-packet.server';
import {
  buildLessonPlanDoc,
  entriesFromPacket,
  planStepsForSummary,
  planSummaryKey,
  type LessonPlanDoc,
  type LessonPlanSummaries,
} from './lesson-plan-doc';
import { PLAN_SUMMARY_SYSTEM, summarizeLessonPlan } from './plan-summary.server';
import { buildKitPlan, type KitPlan } from './kit-plan';

const SUMMARY_DEADLINE_MS = 25_000;
const SUMMARY_MAX_TOKENS = 2_000;

/**
 * The plan, and with the Lesson Deck Kit on, the same plan to the kit's
 * lesson plan spec v1 (its name, color and fonts from the deck).
 */
export async function loadLessonPlan({
  request,
  conversationId,
}: {
  request: Request;
  conversationId: string | undefined;
}): Promise<{ doc: LessonPlanDoc; kit: KitPlan | null }> {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');
  const { planExportV2, deckGallery } = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!planExportV2) throw new Response('Not Found', { status: 404 });

  const loaded = await loadLessonPacket({ request, conversationId, withStackDetails: false });
  const entries = entriesFromPacket(loaded.packet, loaded.materialKinds);
  // The kit's plan asks for short step titles, which a summary written before
  // it does not have.
  const key = `${planSummaryKey(entries)}${deckGallery ? '-kit1' : ''}`;
  const stored = await prisma.lessonPlanConversation.findFirst({
    where: { id: loaded.conversationId },
    select: { planSummary: true, planSummaryKey: true },
  });

  let summaries: LessonPlanSummaries | null =
    stored?.planSummaryKey === key ? (stored.planSummary as LessonPlanSummaries | null) : null;

  if (!summaries && entries.length) {
    summaries = await summarizeLessonPlan({
      title: loaded.packet.title,
      className: loaded.packet.className,
      periodMinutes: loaded.periodMinutes,
      steps: planStepsForSummary(entries),
      complete: async (user) => {
        // Same budget as the planner itself; over it, the plan still downloads
        // with its own first sentences.
        await reserveAiRequest({
          membershipId: access.membership.id,
          organizationId: access.membership.organization.id,
          feature: 'lesson-planner',
          policy: buildLessonPlannerAdmissionPolicy(
            access.membership.organization.numOfTeacherSeats
          ),
          units: 1,
        });
        return getLLMCompletion({
          model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
          system: PLAN_SUMMARY_SYSTEM,
          messages: [{ role: AgentType.User, content: user }],
          maxTokens: SUMMARY_MAX_TOKENS,
          attribution: {
            organizationId: access.membership.organization.id,
            membershipId: access.membership.id,
            route: 'routes/app.lesson-planner_.$conversationId.plan',
            requestId: crypto.randomUUID(),
            ipHash: computeIpHash(request),
          },
          allowFallbackProvider: false,
          signal: AbortSignal.timeout(SUMMARY_DEADLINE_MS),
          logPayload: 'metadata-only',
          metadata: { feature: 'lesson-planner-plan-summary' },
        });
      },
    });
    if (summaries) {
      await prisma.lessonPlanConversation.update({
        where: { id: loaded.conversationId },
        data: { planSummary: summaries, planSummaryKey: key },
      });
    }
  }

  const doc = buildLessonPlanDoc({
    title: loaded.packet.title,
    className: loaded.packet.className,
    periodMinutes: loaded.periodMinutes,
    entries,
    summaries,
  });
  return { doc, kit: deckGallery ? buildKitPlan({ doc, entries }) : null };
}

export async function loadLessonPlanDoc(args: { request: Request; conversationId: string | undefined }): Promise<LessonPlanDoc> {
  return (await loadLessonPlan(args)).doc;
}

/**
 * One small model call for the planner's side jobs (the stack chat, a step's
 * student version, a lesson rewritten for a sub or a family): the planner's
 * own budget and model, a short deadline, and only metadata in the logs.
 */
import { reserveAiRequest } from '~/utils/ai-admission.server';
import { computeIpHash } from '~/utils/ai-usage-log.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { buildLessonPlannerAdmissionPolicy } from '~/utils/lesson-planner/lesson-planner-admission.server';

export type PlannerAccess = {
  membership: {
    id: string;
    organization: { id: string; numOfTeacherSeats?: number | null };
  };
};

export async function plannerComplete({
  request,
  access,
  system,
  user,
  feature,
  route,
  maxTokens = 1_500,
  deadlineMs = 25_000,
}: {
  request: Request;
  access: PlannerAccess;
  system: string;
  user: string;
  feature: string;
  route: string;
  maxTokens?: number;
  deadlineMs?: number;
}): Promise<string> {
  await reserveAiRequest({
    membershipId: access.membership.id,
    organizationId: access.membership.organization.id,
    feature: 'lesson-planner',
    policy: buildLessonPlannerAdmissionPolicy(
      access.membership.organization.numOfTeacherSeats as number
    ),
    units: 1,
  });
  return getLLMCompletion({
    model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
    system,
    messages: [{ role: AgentType.User, content: user }],
    maxTokens,
    attribution: {
      organizationId: access.membership.organization.id,
      membershipId: access.membership.id,
      route,
      requestId: crypto.randomUUID(),
      ipHash: computeIpHash(request),
    },
    allowFallbackProvider: false,
    signal: AbortSignal.timeout(deadlineMs),
    logPayload: 'metadata-only',
    metadata: { feature },
  });
}

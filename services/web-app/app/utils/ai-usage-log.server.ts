/* eslint-disable no-console */
import crypto from 'crypto';
import { prisma } from '~/utils/db.server';

export type UsageDecision =
  | 'ALLOWED'
  | 'DENIED_USER'
  | 'DENIED_ORG'
  | 'DENIED_IP'
  | 'DENIED_GLOBAL'
  | 'DENIED_PAYLOAD'
  | 'DENIED_CONCURRENCY';

export function computeIpHash(request: Request): string | null {
  try {
    const secret = process.env.AI_USAGE_IP_HMAC_SECRET?.trim();
    if (!secret) return null;
    const forwarded = request.headers.get('x-forwarded-for') ?? '';
    const first = forwarded.split(',')[0]?.trim() || '';
    if (!first) return null;
    // Normalize IPv6 brackets and strip port suffix.
    const withoutPort = first.replace(/(^\\[|\\]$)/g, '').replace(/:(\\d+)$/, '');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(withoutPort);
    return hmac.digest('hex');
  } catch {
    return null;
  }
}

export async function logAllowedUsage(args: {
  route: string;
  feature?: string;
  membershipId?: string;
  organizationId?: string;
  classId?: string;
  ipHash?: string | null;
  requestId: string;
  units: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  providerStatus?: string;
}) {
  try {
    await prisma.aiUsageDecisionLog.create({
      data: {
        route: args.route,
        feature: args.feature,
        decision: 'ALLOWED',
        membershipId: args.membershipId,
        organizationId: args.organizationId,
        classId: args.classId,
        ipHash: args.ipHash ?? null,
        requestId: args.requestId,
        units: args.units,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        latencyMs: args.latencyMs,
        providerStatus: args.providerStatus,
      },
    });
  } catch (err) {
    console.error('Failed to log AI usage (ALLOWED):', err);
  }
}

export async function logDeniedUsage(args: {
  route: string;
  feature?: string;
  membershipId?: string;
  organizationId?: string;
  classId?: string;
  ipHash?: string | null;
  requestId: string;
  units: number;
  decision:
    | 'DENIED_USER'
    | 'DENIED_ORG'
    | 'DENIED_IP'
    | 'DENIED_GLOBAL'
    | 'DENIED_PAYLOAD'
    | 'DENIED_CONCURRENCY';
  providerStatus?: string;
}) {
  try {
    await prisma.aiUsageDecisionLog.create({
      data: {
        route: args.route,
        feature: args.feature,
        decision: args.decision,
        membershipId: args.membershipId,
        organizationId: args.organizationId,
        classId: args.classId,
        ipHash: args.ipHash ?? null,
        requestId: args.requestId,
        units: args.units,
        providerStatus: args.providerStatus,
      },
    });
  } catch (err) {
    console.error('Failed to log AI usage (DENIED):', err);
  }
}


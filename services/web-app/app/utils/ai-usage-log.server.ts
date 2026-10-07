/* eslint-disable no-console */
import crypto from 'crypto';
import { prisma } from '~/utils/db.server';
import { getClientIp } from '~/utils/ip.server';

export type UsageDecision =
  | 'ALLOWED'
  | 'DENIED_USER'
  | 'DENIED_ORG'
  | 'DENIED_IP'
  | 'DENIED_GLOBAL'
  | 'DENIED_PAYLOAD'
  | 'DENIED_CONCURRENCY';

/**
 * Keyed fingerprint of the client address for the usage log. Never the raw IP.
 * The address comes from the shared client-IP helper (CloudFront-aware, ignores
 * forged X-Forwarded-For prefixes); HMAC with a server secret keeps the value
 * from being reversed by enumerating the IPv4 space. Returns null when there is
 * no secret or no trustworthy address.
 */
export function computeIpHash(request: Request): string | null {
  try {
    const secret = process.env.AI_USAGE_IP_HMAC_SECRET?.trim();
    if (!secret) return null;
    const ip = getClientIp(request);
    if (!ip || ip === 'unknown') return null;
    return crypto.createHmac('sha256', secret).update(ip).digest('hex');
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
    console.warn('ai_usage_log_failed', { decision: 'ALLOWED', err });
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
    console.warn('ai_usage_log_failed', { decision: 'DENIED', err });
  }
}

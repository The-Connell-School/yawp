import { prisma } from '~/utils/db.server';
import { FreeTierConfigError } from './free-tier-config.server';
import {
  mintSignedLink,
  mintSignedLinkForDevPanel,
  peekSignedLink,
  readSignedLinkPayloadFromAdminToken,
} from './signed-link.server';

function tokenFromLoggedUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('t');
  } catch {
    return null;
  }
}

async function forwardTokenFromEmailLogs(
  applicationId: string,
  approveLinkId: string
): Promise<string | null> {
  const logs = await prisma.freeTierEmailLog.findMany({
    where: {
      applicationId,
      kind: { in: ['admin_approval', 'admin_approval_reminder'] },
      success: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { payload: true },
  });
  for (const { payload } of logs) {
    const record = payload as {
      approveUrl?: string;
      notRightPersonUrl?: string;
    } | null;
    if (!record?.approveUrl || !record.notRightPersonUrl) continue;
    const logApproveToken = tokenFromLoggedUrl(record.approveUrl);
    const forwardToken = tokenFromLoggedUrl(record.notRightPersonUrl);
    if (!logApproveToken || !forwardToken) continue;
    const logApprovePayload =
      readSignedLinkPayloadFromAdminToken(logApproveToken);
    if (logApprovePayload?.linkId !== approveLinkId) continue;
    const peek = await peekSignedLink({
      token: forwardToken,
      expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    if (peek.ok) return forwardToken;
  }
  return null;
}

async function mintForwardTokenForApproveLink(
  applicationId: string,
  approveLinkId: string
): Promise<string | null> {
  const approveRow = await prisma.freeTierSignedLink.findUnique({
    where: { id: approveLinkId },
    select: { expiresAt: true, usedAt: true },
  });
  if (!approveRow || approveRow.usedAt) return null;
  const ttlMs = approveRow.expiresAt.getTime() - Date.now();
  if (ttlMs <= 0) return null;
  const mintArgs = {
    applicationId,
    purpose: 'ADMIN_NOT_RIGHT_PERSON' as const,
    ttlMs,
  };
  try {
    return (await mintSignedLink(mintArgs)).token;
  } catch (error) {
    if (error instanceof FreeTierConfigError) {
      try {
        return (await mintSignedLinkForDevPanel(mintArgs)).token;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Same NRP-purpose token the admin email uses for "Forward this request". */
export async function resolveAdminForwardTokenForApproveLink(args: {
  approveToken: string;
  applicationId: string;
  approveLinkId: string;
}): Promise<string | null> {
  try {
    const fromLog = await forwardTokenFromEmailLogs(
      args.applicationId,
      args.approveLinkId
    );
    if (fromLog) return fromLog;
    return mintForwardTokenForApproveLink(args.applicationId, args.approveLinkId);
  } catch {
    return null;
  }
}

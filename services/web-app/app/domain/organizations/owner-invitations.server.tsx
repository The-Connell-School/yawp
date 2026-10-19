import type { Prisma } from '@app/prisma';
import * as E from '@react-email/components';
import { generateTOTP } from '~/utils/totp.server';
import { sendEmail } from '~/utils/email.server';
import { emailDeliveryDiagnostic } from '~/utils/email-delivery-error.server';

const type = 'onboard-owner';
export const ownerInvitationActions = [
  'organization.invitation.create.after',
  'organization.invitation.resend.after',
];
type Db = Pick<
  Prisma.TransactionClient,
  'invitation' | 'orgMembership' | 'internalPlatformApiAudit'
>;
export type OwnerInvitation = {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  sentAt: string;
  expiresAt: string | null;
  resendHistory: { invitationId: string; resentAt: string }[];
};

// Preserve the retired admin loader's query and return value exactly.
export function listAdminOwnerInvitations(
  db: Pick<Db, 'invitation'>,
  organizationId: string | undefined
) {
  return db.invitation.findMany({
    where: { metadata: JSON.stringify({ organizationId }), type },
  });
}

export function ownerInvitationOrganization(row: {
  organizationId?: string | null;
  metadata?: string | null;
}) {
  let metadataId: unknown;
  try {
    metadataId = JSON.parse(row.metadata || '{}').organizationId;
  } catch {
    return null;
  }
  if (row.organizationId && metadataId !== row.organizationId) return null;
  return typeof metadataId === 'string' ? metadataId : null;
}

export function invitationSummary(row: {
  id: string;
  target: string;
  createdAt: Date;
  expiresAt: Date | null;
}): OwnerInvitation {
  return {
    id: row.id,
    email: row.target.toLowerCase(),
    status: 'pending',
    sentAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    resendHistory: [],
  };
}

export async function ownerEmails(db: Db, organizationId: string) {
  const members = await db.orgMembership.findMany({
    where: { organizationId, isOrgOwner: true, isActive: true },
    select: {
      isOrgOwner: true,
      isActive: true,
      user: { select: { email: true } },
    },
  });
  return new Set(
    members
      .filter((m) => m.isOrgOwner && m.isActive)
      .flatMap((m) => (m.user.email ? [m.user.email.toLowerCase()] : []))
  );
}

/** Acceptance deletes legacy rows. Retain safe API snapshots in the existing
 * audit ledger; never copy OTP configuration or verification URLs there. */
export async function listOwnerInvitations(db: Db, organizationId: string) {
  const [live, audits, owners] = await Promise.all([
    db.invitation.findMany({
      where: {
        type,
        OR: [
          { organizationId },
          { metadata: JSON.stringify({ organizationId }) },
        ],
      },
      select: {
        id: true,
        type: true,
        organizationId: true,
        metadata: true,
        target: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    db.internalPlatformApiAudit.findMany({
      where: {
        targetId: organizationId,
        result: 'after',
        action: { in: ownerInvitationActions },
      },
      select: { metadata: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    ownerEmails(db, organizationId),
  ]);
  const known = new Map<string, OwnerInvitation>();
  for (const audit of audits) {
    const snapshot = audit.metadata as unknown as {
      after?: { invitations?: OwnerInvitation[] };
    };
    for (const invitation of snapshot?.after?.invitations ?? [])
      known.set(invitation.id, invitation);
  }
  const liveIds = new Set<string>();
  for (const row of live) {
    if (ownerInvitationOrganization(row) !== organizationId) continue;
    liveIds.add(row.id);
    known.set(row.id, {
      ...invitationSummary(row),
      resendHistory: known.get(row.id)?.resendHistory ?? [],
    });
  }
  for (const invitation of known.values()) {
    if (invitation.status === 'revoked' || invitation.status === 'accepted')
      continue;
    invitation.status = owners.has(invitation.email)
      ? 'accepted'
      : !liveIds.has(invitation.id)
        ? 'revoked'
        : invitation.expiresAt && Date.parse(invitation.expiresAt) <= Date.now()
          ? 'expired'
          : 'pending';
  }
  return [...known.values()].sort(
    (a, b) => b.sentAt.localeCompare(a.sentAt) || a.id.localeCompare(b.id)
  );
}

export class OwnerInvitationDeliveryError extends Error {}

/** Extracted from the former admin invite-owners action: same OTP algorithm,
 * alphabet, verification route, owner metadata, subject and mail abstraction. */
export async function issueOwnerInvitation(
  db: Db,
  input: {
    organization: { id: string; name: string };
    email: string;
    expiresInDays: number;
    origin: string;
    note?: string;
  }
) {
  const { otp, ...verificationConfig } = await generateTOTP({
    algorithm: 'SHA-256',
    charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
    period: input.expiresInDays * 86400,
  });
  const createdAt = new Date();
  const row = await db.invitation.create({
    data: {
      type,
      target: input.email,
      ...verificationConfig,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + input.expiresInDays * 86400000),
      organizationId: input.organization.id,
      metadata: JSON.stringify({ organizationId: input.organization.id }),
    },
  });
  const verifyUrl = new URL('/auth/inv/verify', input.origin);
  verifyUrl.searchParams.set('type', type);
  verifyUrl.searchParams.set('target', input.email);
  verifyUrl.searchParams.set('code', otp);
  try {
    const delivery = await sendEmail({
      to: input.email,
      singleAttempt: true,
      subject: "You're invited to join your organization on Yawp!",
      react: (
        <E.Html lang="en" dir="ltr">
          <E.Container>
            <E.Heading>Welcome to Yawp!</E.Heading>
            <E.Text>
              You've been invited to join {input.organization.name} as an owner
              on Yawp!
            </E.Text>
            {input.note && <E.Text>{input.note}</E.Text>}
            <E.Text>Click the link to get started:</E.Text>
            <E.Link href={verifyUrl.toString()}>Accept invitation</E.Link>
            <E.Text>
              This invitation will expire in {input.expiresInDays} days for
              security reasons.
            </E.Text>
          </E.Container>
        </E.Html>
      ),
    });
    if (delivery.status !== 'success') throw delivery.error;
  } catch (error) {
    console.error('owner_invitation_delivery_failed', emailDeliveryDiagnostic(error, input.email));
    throw new OwnerInvitationDeliveryError();
  }
  return invitationSummary(row);
}

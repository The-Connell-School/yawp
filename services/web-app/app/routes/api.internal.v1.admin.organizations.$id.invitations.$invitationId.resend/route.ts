import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { recordInternalPlatformWriteAudit } from '~/utils/internal-platform-auth.server';
import { createInternalOwnerInvitationHandlers } from '~/utils/internal-owner-invitations.server';

const handlers = createInternalOwnerInvitationHandlers({
  db: prisma,
  auditRead: recordInternalPlatformWriteAudit,
});
export const action = ({ request, params }: ActionFunctionArgs) =>
  handlers.resend(request, params.id, params.invitationId);
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  handlers.resend(request, params.id, params.invitationId);

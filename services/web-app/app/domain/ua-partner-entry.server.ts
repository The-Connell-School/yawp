import { data, redirect } from 'react-router';
import { setMembershipId } from '~/cookies/membership-id.server';
import { getUserId, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  commitUaPartnerContext,
  getUaPartnerCodeCapture,
  getUaPartnerContext,
  isUaStudentBillingEnabled,
  isValidUaPartnerCode,
  requireUaOrganizationId,
} from '~/utils/ua-partner.server';
import { combineHeaders } from '~/utils/misc';

async function findUaMembership(userId: string, organizationId: string) {
  return prisma.orgMembership.findFirst({
    where: { userId, organizationId, isActive: true },
    select: { id: true, role: true },
  });
}

export async function loadUaPartnerEntry(request: Request) {
  if (!isUaStudentBillingEnabled()) {
    throw new Response('Not found', { status: 404 });
  }

  const organizationId = requireUaOrganizationId();
  const capture = getUaPartnerCodeCapture(request);
  if (capture?.accepted) {
    return redirect(capture.redirectTo, {
      headers: { 'set-cookie': await commitUaPartnerContext() },
    });
  }
  if (capture) return redirect('/auth/inv/signup?codeError=1');

  const [userId, partnerContext] = await Promise.all([
    getUserId(request),
    getUaPartnerContext(request),
  ]);

  if (!userId) {
    return data({
      partner: 'ua' as const,
      authenticated: false as const,
      codeAccepted: partnerContext?.partner === 'ua',
    });
  }

  const membership = await findUaMembership(userId, organizationId);
  if (!membership) {
    return data({
      partner: 'ua' as const,
      authenticated: true as const,
      codeAccepted: partnerContext?.partner === 'ua',
    });
  }

  return redirect(membership.role === 'STUDENT' ? '/billing/ua' : '/app', {
    headers: { 'set-cookie': await setMembershipId(membership.id) },
  });
}

export async function submitUaPartnerEntry(request: Request) {
  const organizationId = requireUaOrganizationId();
  const userId = await requireUserId(request);

  const existing = await findUaMembership(userId, organizationId);
  if (existing) {
    return redirect(existing.role === 'STUDENT' ? '/billing/ua' : '/app', {
      headers: { 'set-cookie': await setMembershipId(existing.id) },
    });
  }

  const formData = await request.formData();
  const partnerContext = await getUaPartnerContext(request);
  const submittedCode = String(formData.get('code') || '');
  if (!partnerContext && !isValidUaPartnerCode(submittedCode)) {
    return data({ error: 'Enter a valid organization code.' }, { status: 400 });
  }

  const membership = await prisma.orgMembership.create({
    data: { userId, organizationId, role: 'STUDENT' },
    select: { id: true },
  });

  return redirect('/billing/ua', {
    headers: combineHeaders(
      { 'set-cookie': await setMembershipId(membership.id) },
      partnerContext ? null : { 'set-cookie': await commitUaPartnerContext() }
    ),
  });
}

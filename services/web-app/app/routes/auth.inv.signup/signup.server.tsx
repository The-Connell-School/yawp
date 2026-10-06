import * as E from '@react-email/components';
import { redirect, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { Prisma } from '@app/prisma';
import {
  GenericStudentSignupSchema,
  RequiredUaStudentSignupSchema,
  UaStudentSignupSchema,
} from '~/components/student-signup-form';
import { prisma } from '~/utils/db.server';
import { sendEmail } from '~/utils/email.server';
import { generateTOTP } from '~/utils/totp.server';
import { getDomainUrl } from '~/utils/misc';
import { normalizeEmail } from '~/utils/normalize-email';
import {
  commitUaPartnerContext,
  getUaPartnerContext,
  isValidUaPartnerCode,
  requireUaOrganizationId,
} from '~/utils/ua-partner.server';
import { enforceUnauthByIpAndTarget, rateLimitedFormResponse } from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';

export async function studentSignupAction(
  { request }: ActionFunctionArgs,
  options: { partner: 'ua' | null } = { partner: null }
) {
  const formData = await request.formData();
  const partnerContext =
    options.partner === 'ua' ? await getUaPartnerContext(request) : null;
  const isUa = options.partner === 'ua';
  const { error, data } = await parseFormData(
    formData,
    isUa
      ? partnerContext
        ? UaStudentSignupSchema
        : RequiredUaStudentSignupSchema
      : GenericStudentSignupSchema
  );
  if (error) return validationError(error);

  if (isUa && !partnerContext && !isValidUaPartnerCode(data.code)) {
    return validationError(
      { fieldErrors: { code: 'Enter a valid organization code.' } },
      data
    );
  }
  const normalizedEmail = normalizeEmail(data.email);
  {
    const cfg = RATE_LIMITS.unauth.signup;
    const decision = await enforceUnauthByIpAndTarget({
      request,
      route: '/auth/inv/signup',
      targetKey: normalizedEmail,
      perIpPerMinute: cfg.perIpPerMinute,
      perIpPerHour: cfg.perIpPerHour,
      perTargetPerHour: cfg.perEmailPerHour,
    });
    if (!decision.allowed) {
      return rateLimitedFormResponse('email', decision.retryAfterSeconds, 'Too many sign-up attempts. Please wait and try again.');
    }
  }

  // Teachers often paste class codes with trailing spaces; trim before lookup.
  const accessCode = data.code?.trim() || undefined;
  const classes = isUa
    ? []
    : await prisma.class.findMany({
        where: {
          code: { equals: accessCode!, mode: 'insensitive' },
          isArchived: false,
        },
        select: { id: true },
        take: 20,
      });

  if (!isUa && classes.length === 0) {
    return validationError({ fieldErrors: { code: 'Invalid code.' } }, data);
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: 'insensitive' },
    },
    select: { id: true },
  });

  if (existingUser) {
    // Support often walks locked-out students through Sign up (asks for a class
    // code). When the account already exists they report "class code rejected"
    // even though the real issue is the wrong flow. Point them at login/reset.
    return validationError(
      {
        fieldErrors: {
          email:
            'An account with this email already exists. Use Log in, or Forgot password to reset it — you do not need a class code to reset your password.',
        },
      },
      data
    );
  }

  const { otp, ...verificationConfig } = await generateTOTP({
    algorithm: 'SHA-256',
    charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
    period: 10 * 60,
  });

  const type = 'onboard-student';
  const target = normalizedEmail;
  const verifyUrl = new URL(`${getDomainUrl(request)}/auth/inv/verify`);
  verifyUrl.searchParams.set('type', type);
  verifyUrl.searchParams.set('target', target);
  verifyUrl.searchParams.set('code', otp);
  if (isUa) verifyUrl.searchParams.set('partner', 'ua');

  const verificationData: Prisma.InvitationCreateInput = {
    type,
    target,
    ...verificationConfig,
    expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
    metadata: JSON.stringify(
      isUa
        ? { partner: 'ua', organizationId: requireUaOrganizationId() }
        : classes.length === 1
          ? { klassId: classes[0]!.id }
          : { klassIds: classes.map((c) => c.id) }
    ),
  };

  const existingInvitation = await prisma.invitation.findFirst({
    where: { target: { equals: target, mode: 'insensitive' }, type },
  });

  if (existingInvitation) {
    let existingPartner: string | null = null;
    try {
      const metadata = JSON.parse(existingInvitation.metadata ?? '{}');
      existingPartner = metadata?.partner === 'ua' ? 'ua' : null;
    } catch {
      existingPartner = null;
    }
    if ((existingPartner === 'ua') !== isUa) {
      return validationError(
        {
          fieldErrors: {
            email:
              'A different pending invitation already exists for this email. Use that invitation before starting another signup.',
          },
        },
        data
      );
    }
  }

  await prisma.$transaction([
    ...(existingInvitation
      ? [prisma.invitation.delete({ where: { id: existingInvitation.id } })]
      : []),
    prisma.invitation.create({ data: verificationData }),
  ]);

  const response = await sendEmail({
    to: normalizedEmail,
    subject: `Welcome to Yawp!`,
    react: (
      <E.Html lang="en" dir="ltr">
        <E.Container>
          <h1>
            <E.Text>Welcome to Yawp!</E.Text>
          </h1>
          <p>
            <E.Text>
              Here's your verification code: <strong>{otp}</strong>
            </E.Text>
          </p>
          <p>
            <E.Text>Or click the link to get started:</E.Text>
          </p>
          <E.Link href={verifyUrl.toString()}>{verifyUrl.toString()}</E.Link>
        </E.Container>
      </E.Html>
    ),
  });

  if (response.status === 'success') {
    verifyUrl.searchParams.delete('code');
    return redirect(verifyUrl.toString(), {
      headers: isUa
        ? { 'set-cookie': await commitUaPartnerContext() }
        : undefined,
    });
  }

  return validationError(
    { fieldErrors: { email: 'Failed to send email. Please try again.' } },
    data
  );
}

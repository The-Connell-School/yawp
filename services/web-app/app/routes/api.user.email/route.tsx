import { type ActionFunctionArgs, data } from 'react-router';
import { z } from 'zod';
import { parseFormData, validationError } from '@rvf/react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { EmailSchema } from '~/utils/schemas/user';
import { normalizeEmail } from '~/utils/normalize-email';
import { generateTOTP } from '~/utils/totp.server';
import { getDomainUrl } from '~/utils/misc';
import { sendEmail } from '~/utils/email.server';
import * as E from '@react-email/components';

const RequestSchema = z.object({ email: EmailSchema });

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (user.email && user.emailVerifiedAt) {
    return validationError({
      fieldErrors: { email: 'Your account already has a verified email.' },
    });
  }

  const { error, data: form } = await parseFormData(request, RequestSchema);
  if (error) return validationError(error);

  const email = normalizeEmail(form.email);
  const conflict = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      NOT: { id: userId },
    },
    select: { id: true },
  });
  if (conflict) {
    return validationError({
      fieldErrors: {
        email:
          'That email is already on another Yawp account. Sign in with that account or choose a different email.',
      },
    });
  }

  const { otp, ...verificationConfig } = await generateTOTP({
    algorithm: 'SHA-256',
    charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
    period: 10 * 60,
  });

  const type = 'verify-account-email';
  const target = `${userId}:${email}`;
  await prisma.invitation.deleteMany({ where: { type, target } });
  await prisma.invitation.create({
    data: {
      type,
      target,
      ...verificationConfig,
      expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
    },
  });

  const verifyUrl = new URL(`${getDomainUrl(request)}/auth/inv/verify`);
  verifyUrl.searchParams.set('type', type);
  verifyUrl.searchParams.set('target', target);
  verifyUrl.searchParams.set('code', otp);

  const response = await sendEmail({
    to: email,
    subject: 'Verify your Yawp email',
    react: (
      <E.Html>
        <E.Text>Your verification code is {otp}</E.Text>
        <E.Link href={verifyUrl.toString()}>Verify email</E.Link>
      </E.Html>
    ),
  });

  if (response.status !== 'success') {
    return validationError({
      fieldErrors: { email: response.error.message },
    });
  }

  verifyUrl.searchParams.delete('code');
  return data({ ok: true, verifyUrl: verifyUrl.toString() });
}

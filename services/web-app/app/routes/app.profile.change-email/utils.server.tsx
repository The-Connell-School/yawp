import * as E from '@react-email/components';
import { data as dataResponse } from 'react-router';
import {
  requireRecentVerification,
  type VerifyFunctionArgs,
} from '~/routes/auth.verify/utils';
import { prisma } from '~/utils/db.server';
import { sendEmail } from '~/utils/email.server.ts';
import { redirectWithToast } from '~/utils/toast.server.ts';
import { verifySessionStorage } from '~/utils/verification.server.ts';

export const newEmailAddressSessionKey = 'new-email-address';

export const handleVerification = async ({
  request,
  submission,
}: VerifyFunctionArgs) => {
  await requireRecentVerification(request);

  if (submission.status !== 'success') {
    throw await redirectWithToast('/auth/login', {
      type: 'error',
      title: 'Invalid submission',
      description: 'Submission was not successful. Please try again.',
    });
  }

  const verifySession = await verifySessionStorage.getSession(
    request.headers.get('cookie')
  );
  const newEmail = verifySession.get(newEmailAddressSessionKey);

  if (!newEmail) {
    return dataResponse(
      submission.reply({
        formErrors: [
          'You must submit the code on the same device that requested the email change.',
        ],
      }),
      { status: 400 }
    );
  }

  const preUpdateUser = await prisma.user.findFirstOrThrow({
    select: { email: true },
    where: { id: submission.value.target },
  });
  const user = await prisma.user.update({
    where: { id: submission.value.target },
    select: { id: true, email: true },
    data: { email: newEmail },
  });

  void sendEmail({
    to: preUpdateUser.email,
    subject: 'Yawp! email changed',
    react: <EmailChangeNoticeEmail userId={user.id} />,
  });

  return redirectWithToast(
    '/app/profile',
    {
      title: 'Email Changed',
      type: 'success',
      description: `Your email has been changed to ${user.email}`,
    },
    {
      headers: {
        'set-cookie': await verifySessionStorage.destroySession(verifySession),
      },
    }
  );
};

export function EmailChangeEmail({
  verifyUrl,
  otp,
}: {
  verifyUrl: string;
  otp: string;
}) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Yawp! Email Change</E.Text>
        </h1>
        <p>
          <E.Text>
            Here's your verification code: <strong>{otp}</strong>
          </E.Text>
        </p>
        <p>
          <E.Text>Or click the link:</E.Text>
        </p>
        <E.Link href={verifyUrl}>{verifyUrl}</E.Link>
      </E.Container>
    </E.Html>
  );
}

export function EmailChangeNoticeEmail({ userId }: { userId: string }) {
  return (
    <E.Html lang="en" dir="ltr">
      <E.Container>
        <h1>
          <E.Text>Your Yawp! email has been changed</E.Text>
        </h1>
        <p>
          <E.Text>
            We're writing to let you know that your Yawp! email has been
            changed.
          </E.Text>
        </p>
        <p>
          <E.Text>
            If you changed your email address, then you can safely ignore this.
            But if you did not change your email address, then please contact
            support immediately.
          </E.Text>
        </p>
        <p>
          <E.Text>Your Account ID: {userId}</E.Text>
        </p>
      </E.Container>
    </E.Html>
  );
}

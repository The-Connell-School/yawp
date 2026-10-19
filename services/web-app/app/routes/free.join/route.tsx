import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useLoaderData,
  useActionData,
} from 'react-router';
import { CircleAlert, Shield } from 'lucide-react';
import { Form } from 'react-router';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import { FREE_TIER_MODEL_TRAINING_LINE } from '~/domain/free-tier/email-copy';
import { createFreeTierTeacherAccount } from '~/domain/free-tier/approval-flow.server';
import {
  getPasswordHash,
  getSessionExpirationDate,
  sessionKey,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import {
  PasswordAndConfirmPasswordSchema,
  NameSchema,
} from '~/utils/schemas/user';
import { z } from 'zod';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const, reason: 'missing' as const };
  const peek = await peekSignedLink({ token, expectedPurpose: 'RELEASE' });
  if (!peek.ok) return { ok: false as const, reason: peek.reason };
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: peek.applicationId },
    select: { email: true, name: true, status: true, releaseEmailCopyVersion: true },
  });
  if (!app) return { ok: false as const, reason: 'invalid' as const };
  return {
    ok: true as const,
    token,
    email: app.email,
    name: app.name,
    status: app.status,
    onboardingV2: app.releaseEmailCopyVersion === 'free-tier-onboarding-v2',
  };
}

const Schema = z
  .object({ name: NameSchema })
  .and(PasswordAndConfirmPasswordSchema);

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const formData = await request.formData();
  const token = String(formData.get('token') ?? '');
  const parsed = Schema.safeParse({
    name: formData.get('name'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success || !token) {
    return { ok: false as const };
  }
  const hash = await getPasswordHash(parsed.data.password);
  const created = await createFreeTierTeacherAccount({
    token,
    name: parsed.data.name,
    passwordHash: hash,
  });
  if (!created.ok) {
    if (created.reason === 'sign_in_required') {
      throw redirect(
        `/auth/login?redirectTo=${encodeURIComponent('/app/free-tier/onboarding')}&message=existing_account`
      );
    }
    return { ok: false as const, reason: created.reason };
  }

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      userId: created.userId,
    },
    select: { id: true },
  });
  const authSession = await authSessionStorage.getSession();
  authSession.set(sessionKey, session.id);
  throw redirect('/app/free-tier/onboarding', {
    headers: {
      'set-cookie': await authSessionStorage.commitSession(authSession),
    },
  });
}

export default function FreeJoinRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  if (!data.ok) {
    return (
      <FreeTierAuthCard title="This invite link isn't valid" icon={<CircleAlert />}>
        <p className="text-sm text-muted-foreground">
          It may have expired. Invites last 30 days.
        </p>
      </FreeTierAuthCard>
    );
  }

  return (
    <FreeTierAuthCard
      title={data.onboardingV2 ? 'Welcome to YAWP!' : 'Create your free classroom'}
      subtitle={data.onboardingV2
        ? 'Your free license covers one class of up to 35 students. Start by creating your account. Next, you’ll set up your class.'
        : "You're in. Set up your account."}
    >
      {actionData && !actionData.ok ? (
        <p role="alert" className="text-sm text-destructive">
          Check your name and matching passwords, then try again. If your invite
          expired, request a new link.
        </p>
      ) : null}
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="token" value={data.token} />
        <FreeTierFieldLabel label="Your name" htmlFor="name">
          <FreeTierTextInput
            id="name"
            name="name"
            defaultValue={data.name}
            required
          />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="School email">
          <FreeTierTextInput value={data.email} readOnly className="bg-muted" />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Password" htmlFor="password" hint="At least 6 characters.">
          <FreeTierTextInput
            id="password"
            name="password"
            type="password"
            required
          />
        </FreeTierFieldLabel>
        <FreeTierFieldLabel label="Confirm password" htmlFor="confirmPassword">
          <FreeTierTextInput
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
          />
        </FreeTierFieldLabel>
        <FreeTierButton type="submit">Create account</FreeTierButton>
      </Form>
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><Shield aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{FREE_TIER_MODEL_TRAINING_LINE}</p>
    </FreeTierAuthCard>
  );
}

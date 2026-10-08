import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useLoaderData,
} from 'react-router';
import { Form } from 'react-router';
import { peekSignedLink } from '~/domain/free-tier/signed-link.server';
import { createFreeTierTeacherAccount } from '~/domain/free-tier/approval-flow.server';
import { getPasswordHash, getSessionExpirationDate, sessionKey } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { PasswordAndConfirmPasswordSchema, NameSchema } from '~/utils/schemas/user';
import { z } from 'zod';
import { FreeTierEntryHeader } from './FreeTierEntryHeader';
import {
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';

export async function loader({ request }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!token) return { ok: false as const, reason: 'missing' as const };
  const peek = await peekSignedLink({ token, expectedPurpose: 'RELEASE' });
  if (!peek.ok) return { ok: false as const, reason: peek.reason };
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: peek.applicationId },
    select: { email: true, name: true, status: true },
  });
  if (!app) return { ok: false as const, reason: 'invalid' as const };
  return { ok: true as const, token, email: app.email, name: app.name, status: app.status };
}

const Schema = z.object({ name: NameSchema }).and(PasswordAndConfirmPasswordSchema);

export async function action({ request }: ActionFunctionArgs) {
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
  const created = await createFreeTierTeacherAccount({ token, name: parsed.data.name, passwordHash: hash });
  if (!created.ok) {
    if (created.reason === 'sign_in_required') {
      throw redirect(
        `/auth/login?redirectTo=${encodeURIComponent('/app/free-tier/onboarding')}&message=existing_account`
      );
    }
    return { ok: false as const, reason: created.reason };
  }

  const session = await prisma.session.create({
    data: { expirationDate: getSessionExpirationDate(), userId: created.userId },
    select: { id: true },
  });
  const authSession = await authSessionStorage.getSession();
  authSession.set(sessionKey, session.id);
  throw redirect('/app/free-tier/onboarding', {
    headers: { 'set-cookie': await authSessionStorage.commitSession(authSession) },
  });
}

export default function FreeJoinRoute() {
  const data = useLoaderData<typeof loader>();
  if (!data.ok) {
    return (
      <main className="yawp-entry yawp-entry-auth">
        <section className="yawp-entry-shell yawp-entry-auth-shell yawp-entry-auth-shell-fit">
          <FreeTierEntryHeader title="This link is not valid" />
          <p className="text-sm text-muted-foreground">Request a new invite from the YAWP team.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="yawp-entry yawp-entry-auth">
      <section className="yawp-entry-shell yawp-entry-auth-shell yawp-entry-auth-shell-fit">
        <FreeTierEntryHeader title="Before we begin" subtitle="Create your free classroom account." />
        <ul className="yawp-entry-join-bullets">
          <li>Students&apos; drafts stay in your classroom. You decide what to assign and when work is final.</li>
          <li>The writing tutor gives feedback while students draft. You always review grades and submissions.</li>
          <li>Student writing is not used to train public AI models.</li>
        </ul>
        <Form method="post" className="yawp-entry-auth-body">
          <input type="hidden" name="token" value={data.token} />
          <FreeTierFieldLabel label="Your name" htmlFor="name">
            <FreeTierTextInput id="name" name="name" defaultValue={data.name} required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="School email">
            <FreeTierTextInput value={data.email} readOnly className="bg-muted" />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="Password" htmlFor="password">
            <FreeTierTextInput id="password" name="password" type="password" required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="Confirm password" htmlFor="confirmPassword">
            <FreeTierTextInput id="confirmPassword" name="confirmPassword" type="password" required />
          </FreeTierFieldLabel>
          <button type="submit" className="yawp-entry-button yawp-entry-button-primary w-full">
            Create account
          </button>
        </Form>
      </section>
    </main>
  );
}

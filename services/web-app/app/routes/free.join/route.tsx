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
import {
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode,
} from '~/utils/preview-access.server';

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
  if (!created.ok) return { ok: false as const, reason: created.reason };

  if (isIsolatedPreviewSeatMode()) {
    const seat = await getPreviewAccessSeat(request);
    if (seat) {
      await prisma.orgMembership.upsert({
        where: {
          userId_organizationId: {
            userId: created.userId,
            organizationId: seat.organizationId,
          },
        },
        create: {
          userId: created.userId,
          organizationId: seat.organizationId,
          role: 'TEACHER',
          isActive: true,
        },
        update: { role: 'TEACHER', isActive: true },
      });
    }
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
      <main className="yawp-entry">
        <section className="yawp-entry-shell">
          <h1 className="text-2xl font-semibold">This link is not valid</h1>
          <p className="text-muted-foreground">Request a new invite from the YAWP team.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="yawp-entry">
      <section className="yawp-entry-shell max-w-lg">
        <h1 className="text-2xl font-semibold mb-2">Before we begin</h1>
        <ul className="list-disc pl-5 text-sm space-y-2 mb-6 text-muted-foreground">
          <li>Students&apos; drafts stay in your classroom. You decide what to assign and when work is final.</li>
          <li>The writing tutor gives feedback while students draft. You always review grades and submissions.</li>
          <li>Student writing is not used to train public AI models.</li>
        </ul>
        <Form method="post" className="space-y-3">
          <input type="hidden" name="token" value={data.token} />
          <label className="block text-sm">
            Your name
            <input name="name" defaultValue={data.name} required className="mt-1 w-full rounded-md border px-3 py-2" />
          </label>
          <label className="block text-sm">
            School email
            <input value={data.email} readOnly className="mt-1 w-full rounded-md border px-3 py-2 bg-muted" />
          </label>
          <label className="block text-sm">
            Password
            <input name="password" type="password" required className="mt-1 w-full rounded-md border px-3 py-2" />
          </label>
          <label className="block text-sm">
            Confirm password
            <input name="confirmPassword" type="password" required className="mt-1 w-full rounded-md border px-3 py-2" />
          </label>
          <button type="submit" className="yawp-entry-button yawp-entry-button-primary w-full">
            Create account
          </button>
        </Form>
      </section>
    </main>
  );
}

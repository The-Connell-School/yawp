import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useLoaderData,
  useFetcher,
} from 'react-router';
import { checkTokenValidity, redeemToken, submitWaitlist, waitlistInputSchema } from '~/domain/free-tier/service.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { enforceUnauthByIpAndTarget } from '~/utils/rate-limit.server';
import { z } from 'zod';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // This module is the /free layout; child routes (/free/join, /free/admin/*) also carry ?t=
  // for signed links. Only interpret ?t= as an acquisition token on the landing path.
  if (url.pathname !== '/free') {
    return { mode: 'waitlist' as const, tokenValid: null };
  }
  const token = url.searchParams.get('t')?.trim();
  if (!token) return { mode: 'waitlist' as const, tokenValid: null };
  const validity = await checkTokenValidity(token);
  return { mode: 'token' as const, token, tokenValid: validity };
}

const formSchema = waitlistInputSchema;

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? 'waitlist');
  const raw = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    schoolName: String(formData.get('schoolName') ?? ''),
    location: String(formData.get('location') ?? ''),
    gradeLevel: String(formData.get('gradeLevel') ?? ''),
    middleName: String(formData.get('middleName') ?? ''),
    token: String(formData.get('token') ?? ''),
  };

  const cfg =
    intent === 'redeem' ? RATE_LIMITS.unauth.freeTierToken : RATE_LIMITS.unauth.freeTierWaitlist;
  const gate = await enforceUnauthByIpAndTarget({
    request,
    route: intent === 'redeem' ? '/api/free-tier/token' : '/api/free-tier/waitlist',
    targetKey: raw.email.toLowerCase().slice(0, 320) || 'none',
    perIpPerMinute: cfg.perIpPerMinute,
    perIpPerHour: cfg.perIpPerHour,
    perTargetPerHour: cfg.perEmailPerHour,
  });
  if (!gate.allowed) {
    return { ok: false, error: 'rate_limited' as const };
  }

  if (raw.middleName.trim()) return { ok: true as const };

  if (intent === 'redeem') {
    const parsed = z
      .object({
        token: z.string().min(1),
        name: z.string().trim().min(1).max(200),
        email: z.string().email(),
        schoolName: z.string().trim().min(1).max(200),
        location: z.string().trim().min(1).max(200),
        gradeLevel: z.string().trim().min(1).max(50),
      })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'invalid' as const };
    const result = await redeemToken(parsed.data);
    if (!result.ok) return { ok: false, error: result.reason };
    if (result.bypassWaitlist) {
      const { sendReleaseEmailsForApplicationIds } = await import('~/domain/free-tier/approval-flow.server');
      const row = await import('~/utils/db.server').then((m) =>
        m.prisma.freeTierApplication.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          select: { id: true },
        })
      );
      if (row) await sendReleaseEmailsForApplicationIds([row.id]);
    }
    return { ok: true as const, redeemed: true as const };
  }

  const parsed = formSchema.safeParse({
    name: raw.name,
    email: raw.email,
    schoolName: raw.schoolName,
    location: raw.location,
    gradeLevel: raw.gradeLevel,
    middleName: raw.middleName,
  });
  if (!parsed.success) return { ok: false, error: 'invalid' as const };
  await submitWaitlist(parsed.data);
  return { ok: true as const };
}

export default function FreeTierLandingRoute() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const submitted = fetcher.data?.ok === true;

  return (
    <main className="yawp-entry">
      <section className="yawp-entry-shell">
        <a className="yawp-entry-logo" href="/" aria-label="YAWP! home">
          <img src="/img/landing/yawp-logo-circle.jpg" alt="YAWP!" />
        </a>
        <div className="yawp-entry-copy">
          <p className="yawp-entry-kicker">Free classroom</p>
          <h1>
            Try YAWP with your students
            <span>Join the waitlist or use your event link.</span>
          </h1>
          <p className="yawp-entry-description">
            YAWP helps students draft essays with AI-assisted feedback while teachers stay in control of
            assignments and grading.
          </p>
        </div>

        {submitted ? (
          <div className="yawp-entry-actions" role="status">
            <p className="text-lg font-medium">You&apos;re on the list.</p>
            <p className="text-muted-foreground">We&apos;ll email you when a spot opens.</p>
          </div>
        ) : (
          <fetcher.Form method="post" className="max-w-md w-full space-y-3">
            <input type="hidden" name="intent" value={data.mode === 'token' ? 'redeem' : 'waitlist'} />
            {data.mode === 'token' && data.token ? (
              <input type="hidden" name="token" value={data.token} />
            ) : null}
            <input type="text" name="middleName" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
            <label className="block text-sm">
              Your name
              <input name="name" required className="mt-1 w-full rounded-md border px-3 py-2" />
            </label>
            <label className="block text-sm">
              School email
              <input name="email" type="email" required className="mt-1 w-full rounded-md border px-3 py-2" />
            </label>
            <label className="block text-sm">
              School name
              <input name="schoolName" required className="mt-1 w-full rounded-md border px-3 py-2" />
            </label>
            <label className="block text-sm">
              Location
              <input name="location" required className="mt-1 w-full rounded-md border px-3 py-2" />
            </label>
            <label className="block text-sm">
              Grade level
              <input name="gradeLevel" required className="mt-1 w-full rounded-md border px-3 py-2" />
            </label>
            {data.mode === 'token' && data.tokenValid && !data.tokenValid.valid ? (
              <p className="text-destructive text-sm">This link is no longer valid.</p>
            ) : null}
            <button type="submit" className="yawp-entry-button yawp-entry-button-primary w-full">
              {data.mode === 'token' ? 'Continue' : 'Join the waitlist'}
            </button>
          </fetcher.Form>
        )}
      </section>
    </main>
  );
}

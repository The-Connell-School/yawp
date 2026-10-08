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
import { FreeTierEntryHeader } from '../free.join/FreeTierEntryHeader';
import { FreeTierFieldLabel, FreeTierTextInput } from '../free-tier/FreeTierAuthCard';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
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

  const title =
    data.mode === 'token' ? 'Try YAWP with your students' : 'Try YAWP with your students';
  const subtitle =
    data.mode === 'token' ? 'Use your event link to continue.' : 'Join the waitlist or use your event link.';

  return (
    <main className="yawp-entry yawp-entry-auth">
      <section className="yawp-entry-shell yawp-entry-auth-shell yawp-entry-auth-shell-fit">
        <FreeTierEntryHeader title={title} subtitle={subtitle} kicker="Free classroom" />
        <p className="text-sm text-foreground/80 -mt-1">
          YAWP helps students draft essays with AI-assisted feedback while teachers stay in control of
          assignments and grading.
        </p>

        {submitted ? (
          <div className="yawp-entry-auth-body" role="status">
            <p className="text-sm font-medium text-foreground">You&apos;re on the list.</p>
            <p className="text-sm text-muted-foreground">We&apos;ll email you when a spot opens.</p>
          </div>
        ) : (
          <fetcher.Form method="post" className="yawp-entry-auth-body">
            <input type="hidden" name="intent" value={data.mode === 'token' ? 'redeem' : 'waitlist'} />
            {data.mode === 'token' && data.token ? (
              <input type="hidden" name="token" value={data.token} />
            ) : null}
            <input type="text" name="middleName" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
            <FreeTierFieldLabel label="Your name" htmlFor="name">
              <FreeTierTextInput id="name" name="name" required />
            </FreeTierFieldLabel>
            <FreeTierFieldLabel label="School email" htmlFor="email">
              <FreeTierTextInput id="email" name="email" type="email" required />
            </FreeTierFieldLabel>
            <FreeTierFieldLabel label="School name" htmlFor="schoolName">
              <FreeTierTextInput id="schoolName" name="schoolName" required />
            </FreeTierFieldLabel>
            <FreeTierFieldLabel label="Location" htmlFor="location">
              <FreeTierTextInput id="location" name="location" required />
            </FreeTierFieldLabel>
            <FreeTierFieldLabel label="Grade level" htmlFor="gradeLevel">
              <FreeTierTextInput id="gradeLevel" name="gradeLevel" required />
            </FreeTierFieldLabel>
            {data.mode === 'token' && data.tokenValid && !data.tokenValid.valid ? (
              <p className="text-sm text-destructive">This link is no longer valid.</p>
            ) : null}
            {fetcher.data?.ok === false && fetcher.data.error === 'rate_limited' ? (
              <p className="text-sm text-destructive">Too many attempts. Please wait and try again.</p>
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

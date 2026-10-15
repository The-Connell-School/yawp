import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  useLoaderData,
  useFetcher,
} from 'react-router';
import {
  checkTokenValidity,
  findAcquisitionTokenByCredential,
  recordAcquisitionTokenScan,
  redeemToken,
  submitWaitlist,
  waitlistInputSchema,
} from '~/domain/free-tier/service.server';
import { readOrMintScanDedupeCookie, readScanDedupeCookie } from '~/domain/free-tier/acquisition-token-scan.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { enforceUnauthByIpAndTarget } from '~/utils/rate-limit.server';
import { z } from 'zod';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierTextInput,
} from '../free-tier/FreeTierAuthCard';
import { useState } from 'react';
import { CircleCheck, CircleAlert, Mail } from 'lucide-react';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const url = new URL(request.url);
  const token = url.searchParams.get('t')?.trim();
  if (!token)
    return {
      mode: 'waitlist' as const,
      tokenValid: null,
      linkClosed: false as const,
    };
  const cookie = await readOrMintScanDedupeCookie(request);
  const row = await findAcquisitionTokenByCredential(token);
  if (row) {
    await recordAcquisitionTokenScan({
      tokenId: row.id,
      dedupeCookie: cookie.value,
      userAgent: request.headers.get('user-agent'),
    });
  }
  const validity = await checkTokenValidity(token);
  const linkClosed =
    validity.valid === false &&
    (validity.reason === 'disabled' ||
      validity.reason === 'expired' ||
      validity.reason === 'exhausted');
  const payload = {
    mode: 'token' as const,
    token,
    tokenValid: validity,
    linkClosed,
  };
  if (cookie.setCookie) {
    return data(payload, { headers: { 'Set-Cookie': cookie.setCookie } });
  }
  return payload;
}

const formSchema = waitlistInputSchema;

type FreeTierSubmitSuccessInput = {
  redeemed?: boolean;
  bypassWaitlist?: boolean;
  email?: string;
};

export function freeTierSubmitSuccessCopy(
  submission: FreeTierSubmitSuccessInput | undefined
) {
  if (submission?.redeemed && submission.bypassWaitlist) {
    return {
      headline: 'Check your email',
      detail: submission.email ? `Your join link is on its way to ${submission.email}.` : 'Your join link is on its way.',
    };
  }
  return {
    headline: "You're on the list",
    detail: submission?.email ? `We will email ${submission.email} when your classroom is ready.` : "We will email you when your classroom is ready.",
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
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
    intent === 'redeem'
      ? RATE_LIMITS.unauth.freeTierToken
      : RATE_LIMITS.unauth.freeTierWaitlist;
  const gate = await enforceUnauthByIpAndTarget({
    request,
    route:
      intent === 'redeem' ? '/api/free-tier/token' : '/api/free-tier/waitlist',
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
    const result = await redeemToken(parsed.data, { scanDedupeCookie: await readScanDedupeCookie(request) });
    if (!result.ok) return { ok: false, error: result.reason };
    if (result.bypassWaitlist) {
      const { sendReleaseEmailsForApplicationIds } =
        await import('~/domain/free-tier/approval-flow.server');
      const row = await import('~/utils/db.server').then((m) =>
        m.prisma.freeTierApplication.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          select: { id: true },
        })
      );
      if (row) await sendReleaseEmailsForApplicationIds([row.id]);
    }
    return {
      ok: true as const,
      redeemed: true as const,
      bypassWaitlist: result.bypassWaitlist,
    };
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
  const [submittedEmail, setSubmittedEmail] = useState('');
  const submitted = fetcher.data?.ok === true;
  const submitSuccess = submitted
    ? freeTierSubmitSuccessCopy({ ...fetcher.data, email: submittedEmail })
    : null;

  const title = data.mode === 'token' && data.linkClosed
    ? 'This link is closed'
    : submitSuccess?.headline ?? 'Try YAWP with your students';
  const subtitle = submitted || (data.mode === 'token' && data.linkClosed)
    ? undefined
    : data.mode === 'token' ? 'Use your event link to continue.'
    : 'Join the waitlist. We let teachers in a group at a time.';

  return (
    <FreeTierAuthCard status={submitted} title={title} subtitle={subtitle} icon={data.mode === 'token' && data.linkClosed ? <CircleAlert /> : submitted ? (fetcher.data && 'bypassWaitlist' in fetcher.data && fetcher.data.bypassWaitlist ? <Mail /> : <CircleCheck />) : undefined}>
      {data.mode === 'token' && data.linkClosed ? (
        <div className="flex flex-col gap-4" role="status">
          <p className="text-sm text-muted-foreground">
            It expired, reached its limit, or was turned off.
          </p>
          <FreeTierButton asChild>
            <a href="/free">Join the waitlist</a>
          </FreeTierButton>
        </div>
      ) : submitSuccess ? (
        <div className="flex flex-col gap-4">
          {submitSuccess.detail ? (
            <p className="text-sm text-muted-foreground">
              {submitSuccess.detail}
            </p>
          ) : null}
        </div>
      ) : (
        <fetcher.Form method="post" className="flex flex-col gap-4" onSubmit={event => setSubmittedEmail(String(new FormData(event.currentTarget).get('email') ?? ''))}>
          <input
            type="hidden"
            name="intent"
            value={data.mode === 'token' ? 'redeem' : 'waitlist'}
          />
          {data.mode === 'token' && data.token ? (
            <input type="hidden" name="token" value={data.token} />
          ) : null}
          <input
            type="text"
            name="middleName"
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
          />
          <FreeTierFieldLabel label="Your name" htmlFor="name">
            <FreeTierTextInput id="name" name="name" required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="School email" htmlFor="email">
            <FreeTierTextInput id="email" name="email" type="email" placeholder="you@school.edu" required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="School name" htmlFor="schoolName">
            <FreeTierTextInput id="schoolName" name="schoolName" required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="Location" htmlFor="location">
            <FreeTierTextInput id="location" name="location" placeholder="City, state" required />
          </FreeTierFieldLabel>
          <FreeTierFieldLabel label="Grade level" htmlFor="gradeLevel">
            <FreeTierTextInput id="gradeLevel" name="gradeLevel" required />
          </FreeTierFieldLabel>
          {data.mode === 'token' &&
          data.tokenValid &&
          !data.tokenValid.valid ? (
            <p className="text-sm text-destructive" role="alert">
              This link is no longer valid.
            </p>
          ) : null}
          {fetcher.data?.ok === false &&
          fetcher.data.error === 'rate_limited' ? (
            <p className="text-sm text-destructive" role="alert">
              Too many attempts. Please wait and try again.
            </p>
          ) : null}
          {fetcher.data?.ok === false &&
          fetcher.data.error === 'cap_reached' ? (
            <p className="text-sm text-destructive" role="alert">
              This free classroom event is full.
            </p>
          ) : null}
          {fetcher.data?.ok === false &&
          fetcher.data.error === 'budget_exceeded' ? (
            <p className="text-sm text-destructive" role="alert">
              This event link is paused because the current free-tier budget has been reached.
            </p>
          ) : null}
          {fetcher.data?.ok === false &&
          (fetcher.data.error === 'cap_reached' || fetcher.data.error === 'budget_exceeded') ? (
            <a href="/free" className="text-sm underline">Join the waitlist</a>
          ) : null}
          <FreeTierButton type="submit">
            {data.mode === 'token' ? 'Continue' : 'Join the waitlist'}
          </FreeTierButton>
        </fetcher.Form>
      )}
    </FreeTierAuthCard>
  );
}

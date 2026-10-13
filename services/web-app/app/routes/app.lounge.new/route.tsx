import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { useState } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { MentionTextarea } from '~/components/lounge/mention-textarea';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { requireLoungeAccess } from '~/domain/lounge/access.server';
import { loungeByline, type LoungeDisplayNameStyleKey } from '~/domain/lounge/display-name';
import {
  createLoungePost,
  getLoungeProfile,
  listMentionCandidates,
} from '~/domain/lounge/lounge.server';
import { decodeMentions } from '~/domain/lounge/mentions';
import { sendLoungeNotifications } from '~/domain/lounge/notifications.server';
import { findPrivacyConcerns, privacyConcernMessage } from '~/domain/lounge/privacy-nudge';
import { LOUNGE_POST_KINDS, LOUNGE_TOPICS, type LoungePostKindKey } from '~/domain/lounge/topics';
import { LOUNGE_TITLE_MAX, parseLoungePostInput } from '~/domain/lounge/validation';
import { prisma } from '~/utils/db.server';
import { getDomainUrl } from '~/utils/misc';
import { cn } from '~/utils/misc';
import { enforceAuthenticatedUserAndIp } from '~/utils/rate-limit.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { viewer, membership } = await requireLoungeAccess(request);
  const profile = await getLoungeProfile(viewer.userId);
  if (!profile && !viewer.isStaff) {
    throw redirect('/app/lounge/welcome?redirectTo=/app/lounge/new');
  }
  const [candidates, user] = await Promise.all([
    listMentionCandidates(viewer, null),
    prisma.user.findUnique({ where: { id: viewer.userId }, select: { name: true } }),
  ]);
  return data({
    candidates,
    postingAs: loungeByline({
      name: user?.name,
      style: (profile?.displayNameStyle ?? null) as LoungeDisplayNameStyleKey | null,
      schoolName: membership.organization.name,
      isStaff: viewer.isStaff,
    }),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const access = await requireLoungeAccess(request);
  const { viewer } = access;
  if (!viewer.isStaff && !(await getLoungeProfile(viewer.userId))) {
    throw redirect('/app/lounge/welcome?redirectTo=/app/lounge/new');
  }
  const form = Object.fromEntries(await request.formData());
  const values = {
    kind: String(form.kind ?? 'QUESTION'),
    topic: String(form.topic ?? ''),
    title: String(form.title ?? ''),
    body: String(form.body ?? ''),
    askStaff: form.askStaff === 'on',
    askPrivately: form.askPrivately === 'on',
  };
  const parsed = parseLoungePostInput(form);
  if (!parsed.ok) return data({ errors: parsed.errors, values }, { status: 400 });

  const limit = await enforceAuthenticatedUserAndIp({
    request,
    route: 'lounge-post',
    userId: viewer.userId,
    perUserPerHour: 10,
    perIpPerMinute: 10,
    perIpPerHour: 60,
  });
  if (!limit.allowed) {
    return data(
      { errors: { form: 'You have posted a lot this hour. Please try again a little later.' }, values },
      { status: 429 }
    );
  }

  const { postId, notifications } = await createLoungePost({
    viewer,
    organizationId: access.organizationId,
    input: parsed.value,
  });
  void sendLoungeNotifications(notifications, getDomainUrl(request));
  throw redirect(`/app/lounge/${postId}`);
}

export default function LoungeNewPostRoute() {
  const { candidates, postingAs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const values = actionData?.values;
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};
  const initialBody = decodeMentions(values?.body ?? '');
  const [kind, setKind] = useState<LoungePostKindKey>(
    (values?.kind as LoungePostKindKey) ?? 'QUESTION'
  );
  const [bodyText, setBodyText] = useState(initialBody.text);
  const [askPrivately, setAskPrivately] = useState(values?.askPrivately ?? false);
  const nudge = privacyConcernMessage(findPrivacyConcerns(bodyText));
  const titleLabel = LOUNGE_POST_KINDS.find((k) => k.key === kind)?.titleLabel ?? 'Title';

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link to="/app/lounge" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
          ← Teacher&apos;s Lounge
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New post</h1>

        <Form method="post" className="mt-6 flex flex-col gap-6">
          <fieldset className="flex gap-6 border-b">
            <legend className="sr-only">Post type</legend>
            {LOUNGE_POST_KINDS.map((option) => (
              <label
                key={option.key}
                className={cn(
                  '-mb-px cursor-pointer border-b-2 pb-2 text-[15px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
                  kind === option.key
                    ? 'border-foreground font-medium'
                    : 'border-transparent text-muted-foreground'
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option.key}
                  checked={kind === option.key}
                  onChange={() => setKind(option.key)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-2">
            <label htmlFor="lounge-title" className="text-sm text-muted-foreground">
              Title
            </label>
            <Input
              id="lounge-title"
              name="title"
              defaultValue={values?.title}
              placeholder={titleLabel}
              maxLength={LOUNGE_TITLE_MAX}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'lounge-title-error' : undefined}
              className="h-12 text-lg"
            />
            {errors.title ? (
              <p id="lounge-title-error" className="text-sm text-destructive">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="lounge-body" className="text-sm text-muted-foreground">
              Details
            </label>
            <MentionTextarea
              id="lounge-body"
              name="body"
              rows={7}
              candidates={candidates}
              defaultText={initialBody.text}
              defaultMentions={initialBody.mentions}
              placeholder="Type @ to mention Brian or the Yawp team."
              onTextChange={setBodyText}
              aria-invalid={Boolean(errors.body)}
              aria-describedby={errors.body ? 'lounge-body-error' : nudge ? 'lounge-body-nudge' : undefined}
            />
            {errors.body ? (
              <p id="lounge-body-error" className="text-sm text-destructive">
                {errors.body}
              </p>
            ) : null}
            {nudge ? (
              <p id="lounge-body-nudge" className="text-sm text-amber-800" aria-live="polite">
                {nudge}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="lounge-topic" className="text-sm text-muted-foreground">
              Topic
            </label>
            <select
              id="lounge-topic"
              name="topic"
              defaultValue={values?.topic ?? ''}
              aria-invalid={Boolean(errors.topic)}
              className="h-11 rounded-md border border-input bg-input-background px-3 text-[15px]"
            >
              <option value="" disabled>
                Choose a topic
              </option>
              {LOUNGE_TOPICS.map((topic) => (
                <option key={topic.key} value={topic.key}>
                  {topic.label}
                </option>
              ))}
            </select>
            {errors.topic ? <p className="text-sm text-destructive">{errors.topic}</p> : null}
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="askStaff"
                defaultChecked={values?.askStaff}
                className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span className="flex flex-col">
                <span>Ask the Yawp team to answer this</span>
                <span className="text-sm text-muted-foreground">
                  Brian or someone on the team replies here, usually within two school days.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="askPrivately"
                checked={askPrivately}
                onChange={(event) => setAskPrivately(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span className="flex flex-col">
                <span>Keep it private between me and the Yawp team</span>
                <span className="text-sm text-muted-foreground">
                  Other teachers won&apos;t see it. Use this for anything about a specific student.
                </span>
              </span>
            </label>
          </div>

          {errors.form ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={navigation.state === 'submitting'}>
              Post
            </Button>
            <span className="text-sm text-muted-foreground">
              as {postingAs.name}
              {postingAs.detail ? ` · ${postingAs.detail}` : ''} ·{' '}
              <Link to="/app/lounge/welcome?redirectTo=/app/lounge/new" className="underline">
                change
              </Link>
            </span>
          </div>
        </Form>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

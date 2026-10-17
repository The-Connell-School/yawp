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
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, FileText, X } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { MentionTextarea } from '~/components/lounge/mention-textarea';
import { LoungeVideoRecorder } from '~/components/lounge/lounge-video-recorder';
import { LocalDateTimeInput } from '~/components/lounge/local-time';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { requireLoungeMember } from '~/domain/lounge/access.server';
import { loungeByline } from '~/domain/lounge/display-name';
import { LOUNGE_NAME, LOUNGE_TEAM_NAME, parseLoungeSchedule } from '~/domain/lounge/launch';
import {
  LoungeShareError,
  createLoungePost,
  listMentionCandidates,
  listShareableAssignments,
  type ShareableAssignment,
} from '~/domain/lounge/lounge.server';
import { parseLoungeVideoInput } from '~/domain/lounge/video';
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
  const { viewer, membership } = await requireLoungeMember(request);
  const [candidates, user, shareable] = await Promise.all([
    listMentionCandidates(viewer, null),
    prisma.user.findUnique({ where: { id: viewer.userId }, select: { name: true } }),
    membership.role === 'TEACHER' ? listShareableAssignments(membership.id) : Promise.resolve([]),
  ]);
  return data({
    candidates,
    shareable,
    isStaff: viewer.isStaff,
    postingAs: loungeByline({
      name: user?.name,
      style: null,
      schoolName: membership.organization.name,
      isStaff: viewer.isStaff,
    }),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const access = await requireLoungeMember(request);
  const { viewer } = access;
  const form = Object.fromEntries(await request.formData());
  const values = {
    kind: String(form.kind ?? 'QUESTION'),
    topic: String(form.topic ?? ''),
    title: String(form.title ?? ''),
    body: String(form.body ?? ''),
    askStaff: form.askStaff === 'on',
    askPrivately: form.askPrivately === 'on',
    attachAssignmentId: String(form.attachAssignmentId ?? ''),
    pin: form.pin === 'on',
    publishMode: String(form.publishMode ?? 'now'),
  };
  const parsed = parseLoungePostInput(form);
  if (!parsed.ok) return data({ errors: parsed.errors, values }, { status: 400 });
  const video = parseLoungeVideoInput(form, { userId: viewer.userId, isStaff: viewer.isStaff });
  if (!video.ok) return data({ errors: video.errors, values }, { status: 400 });
  const schedule = viewer.isStaff ? parseLoungeSchedule(form, new Date()) : null;
  if (schedule && !schedule.ok) return data({ errors: { publishAt: schedule.error }, values }, { status: 400 });

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

  let created: Awaited<ReturnType<typeof createLoungePost>>;
  try {
    created = await createLoungePost({
      viewer,
      organizationId: access.organizationId,
      membershipId: access.membership.id,
      input: {
        ...parsed.value,
        attachAssignmentId: values.attachAssignmentId || null,
        video: video.value,
        pin: viewer.isStaff && values.pin,
        schedule: schedule?.ok ? schedule.value : null,
      },
    });
  } catch (error) {
    if (error instanceof LoungeShareError) {
      return data({ errors: { form: error.message }, values }, { status: 400 });
    }
    throw error;
  }
  const { postId, notifications } = created;
  void sendLoungeNotifications(notifications, getDomainUrl(request));
  throw redirect(`/app/lounge/${postId}`);
}

const PUBLISH_MODES = [
  { key: 'now', label: 'Post now', submit: 'Post' },
  { key: 'draft', label: 'Save as draft', submit: 'Save draft' },
  { key: 'schedule', label: 'Schedule', submit: 'Schedule post' },
] as const;
type PublishMode = (typeof PUBLISH_MODES)[number]['key'];

export default function LoungeNewPostRoute() {
  const { candidates, postingAs, shareable, isStaff } = useLoaderData<typeof loader>();
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
  const [publishMode, setPublishMode] = useState<PublishMode>(
    (PUBLISH_MODES.find((option) => option.key === values?.publishMode)?.key ?? 'now') as PublishMode
  );
  const nudge = privacyConcernMessage(findPrivacyConcerns(bodyText));
  const titleLabel = LOUNGE_POST_KINDS.find((k) => k.key === kind)?.titleLabel ?? 'Title';

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          to="/app/lounge"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {LOUNGE_NAME}
        </Link>
        <h1 className="lounge-serif mt-1 text-[38px] leading-tight text-foreground">New post</h1>

        <Form method="post" className="mt-6 flex flex-col gap-6">
          <fieldset className="flex gap-6 border-b">
            <legend className="sr-only">Post type</legend>
            {LOUNGE_POST_KINDS.map((option) => (
              <label
                key={option.key}
                className={cn(
                  'relative -mb-px cursor-pointer border-b-2 pb-2 text-[15px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
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
                  className="absolute inset-0 m-0 cursor-pointer opacity-0"
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
              placeholder={`Type @ to mention Brian or the ${LOUNGE_TEAM_NAME}.`}
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
            ) : (
              <p className="text-sm text-muted-foreground">
                Sharing student writing is welcome. Take the student&apos;s name off first.
              </p>
            )}
          </div>

          {shareable.length > 0 ? (
            <AttachFromYawp
              assignments={shareable}
              defaultId={values?.attachAssignmentId || null}
              error={errors.attachAssignmentId}
            />
          ) : null}

          {isStaff ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Video (optional)</span>
              <LoungeVideoRecorder />
              {errors.video ? <p className="text-sm text-destructive">{errors.video}</p> : null}
            </div>
          ) : null}

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
                <span>Ask the {LOUNGE_TEAM_NAME} to answer this</span>
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
                <span>Keep it private between me and the {LOUNGE_TEAM_NAME}</span>
                <span className="text-sm text-muted-foreground">
                  Other teachers won&apos;t see it. Use this for anything about a specific student.
                </span>
              </span>
            </label>
          </div>

          {isStaff ? (
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="pin"
                defaultChecked={values?.pin}
                className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span className="flex flex-col">
                <span>Pin to the top of the Lounge</span>
                <span className="text-sm text-muted-foreground">
                  Pinned posts sit above the feed, oldest pin first. Unpin from the post.
                </span>
              </span>
            </label>
          ) : null}

          {errors.form ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          ) : null}

          {isStaff ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm text-muted-foreground">When</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {PUBLISH_MODES.map((option) => (
                  <label key={option.key} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="publishMode"
                      value={option.key}
                      checked={publishMode === option.key}
                      onChange={() => setPublishMode(option.key)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {publishMode === 'schedule' ? (
                <LocalDateTimeInput id="lounge-publish-at" name="publishAt" label="Post on" />
              ) : null}
              {publishMode === 'draft' ? (
                <span className="text-sm text-muted-foreground">
                  Only the {LOUNGE_TEAM_NAME} sees drafts. Publish or schedule it from the Lounge inbox.
                </span>
              ) : null}
              {errors.publishAt ? <p className="text-sm text-destructive">{errors.publishAt}</p> : null}
            </fieldset>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={navigation.state === 'submitting'}>
              {PUBLISH_MODES.find((option) => option.key === publishMode)?.submit ?? 'Post'}
            </Button>
            <span className="text-sm text-muted-foreground">
              as {postingAs.name}
              {postingAs.detail ? ` · ${postingAs.detail}` : ''}
            </span>
          </div>
        </Form>
      </div>
    </section>
  );
}

/**
 * One quiet button that opens a short list of the teacher's own assignments.
 * The chosen one shows as a single small card; the post carries its id.
 */
function AttachFromYawp({
  assignments,
  defaultId,
  error,
}: {
  assignments: ShareableAssignment[];
  defaultId: string | null;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    assignments.some((a) => a.id === defaultId) ? defaultId : null
  );
  const selected = assignments.find((a) => a.id === selectedId) ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Attached from YAWP!</span>
      <input type="hidden" name="attachAssignmentId" value={selectedId ?? ''} />
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText size={18} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{selected.title}</span>
            <span className="text-xs text-muted-foreground">
              {selected.typeTitle} · other teachers get a copy, never your students&apos; work
            </span>
          </span>
          <button
            type="button"
            aria-label="Remove attachment"
            onClick={() => setSelectedId(null)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-dashed border-muted-foreground/50 px-4 text-[15px] hover:bg-secondary"
        >
          Attach from YAWP!
        </button>
      )}
      {open && !selected ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Attach from YAWP!"
          className="absolute left-0 top-full z-20 mt-1 w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-lg"
        >
          <p className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your assignments
          </p>
          <ul className="max-h-72 overflow-y-auto py-1">
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(assignment.id);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-secondary focus:bg-secondary focus:outline-none"
                >
                  <span className="text-[15px]">{assignment.title}</span>
                  <span className="text-xs text-muted-foreground">{assignment.typeTitle}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

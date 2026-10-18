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
import { COMPOSER_TOPICS, LOUNGE_POST_KINDS, kindAttachesLesson, type LoungePostKindKey } from '~/domain/lounge/topics';
import {
  LOUNGE_IMAGE_MAX_BYTES,
  LOUNGE_IMAGE_MAX_COUNT,
  LOUNGE_IMAGE_TYPES,
  kindAllowsImages,
  prepareLoungeImages,
} from '~/domain/lounge/images';
import { LOUNGE_POST_IMAGES_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { LOUNGE_TITLE_MAX, parseLoungePostInput } from '~/domain/lounge/validation';
import { prisma } from '~/utils/db.server';
import { getDomainUrl } from '~/utils/misc';
import { cn } from '~/utils/misc';
import { enforceAuthenticatedUserAndIp } from '~/utils/rate-limit.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { viewer, membership } = await requireLoungeMember(request);
  const [candidates, user, shareable, imagesEnabled] = await Promise.all([
    listMentionCandidates(viewer, null),
    prisma.user.findUnique({ where: { id: viewer.userId }, select: { name: true } }),
    membership.role === 'TEACHER' ? listShareableAssignments(membership.id) : Promise.resolve([]),
    imagesAllowed(viewer.isStaff, membership.organization.id),
  ]);
  return data({
    candidates,
    shareable,
    imagesEnabled,
    isStaff: viewer.isStaff,
    postingAs: loungeByline({
      name: user?.name,
      style: null,
      schoolName: membership.organization.name,
      isStaff: viewer.isStaff,
    }),
  });
}

/** Screenshots and photos on posts: the YAWP! team always, schools with the flag on. */
async function imagesAllowed(isStaff: boolean, organizationId: string): Promise<boolean> {
  return isStaff || isFeatureFlagEnabled(LOUNGE_POST_IMAGES_FLAG, organizationId);
}

// Three images at the cap, plus room for the rest of the form.
const MAX_POST_REQUEST_BYTES = LOUNGE_IMAGE_MAX_COUNT * LOUNGE_IMAGE_MAX_BYTES + 1024 * 1024;

export async function action({ request }: ActionFunctionArgs) {
  const access = await requireLoungeMember(request);
  const { viewer } = access;
  // Before parsing: formData() buffers the whole body.
  const declaredLength = Number(request.headers.get('Content-Length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_POST_REQUEST_BYTES) {
    throw data({ error: 'Too large' }, { status: 413 });
  }
  const formData = await request.formData();
  const form = Object.fromEntries(formData);
  const values = {
    kind: String(form.kind ?? 'QUESTION'),
    topic: String(form.topic ?? ''),
    title: String(form.title ?? ''),
    body: String(form.body ?? ''),
    askStaff: form.askStaff === 'on',
    attachAssignmentId: String(form.attachAssignmentId ?? ''),
    pin: form.pin === 'on',
    publishMode: String(form.publishMode ?? 'now'),
  };
  const parsed = parseLoungePostInput(form);
  if (!parsed.ok) return data({ errors: parsed.errors, values }, { status: 400 });
  const video = parseLoungeVideoInput(form, { userId: viewer.userId, isStaff: viewer.isStaff });
  if (!video.ok) return data({ errors: video.errors, values }, { status: 400 });
  const files = formData.getAll('images').filter((value): value is File => value instanceof File && value.size > 0);
  let images: Extract<ReturnType<typeof prepareLoungeImages>, { ok: true }>['images'] = [];
  if (files.length > 0 && kindAllowsImages(parsed.value.kind)) {
    if (!(await imagesAllowed(viewer.isStaff, access.organizationId))) {
      return data({ errors: { images: 'Images are not turned on for your school yet.' }, values }, { status: 400 });
    }
    const prepared = prepareLoungeImages(
      await Promise.all(
        files.map(async (file) => ({ type: file.type, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) }))
      ),
      String(form.imageAlt ?? '')
    );
    if (!prepared.ok) return data({ errors: { images: prepared.error }, values }, { status: 400 });
    images = prepared.images;
  }
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
        images,
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
  const { candidates, postingAs, shareable, imagesEnabled, isStaff } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const values = actionData?.values;
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};
  const initialBody = decodeMentions(values?.body ?? '');
  const [kind, setKind] = useState<LoungePostKindKey>(
    (values?.kind as LoungePostKindKey) ?? 'QUESTION'
  );
  const [bodyText, setBodyText] = useState(initialBody.text);
  const [topic, setTopic] = useState(values?.topic ?? '');
  const [publishMode, setPublishMode] = useState<PublishMode>(
    (PUBLISH_MODES.find((option) => option.key === values?.publishMode)?.key ?? 'now') as PublishMode
  );
  const nudge = privacyConcernMessage(findPrivacyConcerns(bodyText));
  const kindInfo = LOUNGE_POST_KINDS.find((k) => k.key === kind) ?? LOUNGE_POST_KINDS[0];
  const topicHint = COMPOSER_TOPICS.find((option) => option.key === topic)?.hint;

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

        <Form
          method="post"
          encType={imagesEnabled ? 'multipart/form-data' : undefined}
          className="mt-6 flex flex-col gap-6"
        >
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

          <p id="lounge-kind-prompt" data-testid="lounge-kind-prompt" className="-mt-2 text-[15px] text-foreground">
            {kindInfo.prompt}
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor="lounge-title" className="text-sm text-muted-foreground">
              Title
            </label>
            <Input
              id="lounge-title"
              name="title"
              defaultValue={values?.title}
              placeholder={kindInfo.titleLabel}
              maxLength={LOUNGE_TITLE_MAX}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'lounge-kind-prompt lounge-title-error' : 'lounge-kind-prompt'}
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
                Sharing student writing is welcome, but be sure to take the student’s name off first.
              </p>
            )}
          </div>

          {imagesEnabled && kindAllowsImages(kind) ? <AddImages error={errors.images} /> : null}

          {kindAttachesLesson(kind) && shareable.length > 0 ? (
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
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              aria-invalid={Boolean(errors.topic)}
              aria-describedby={topicHint ? 'lounge-topic-hint' : undefined}
              className="h-11 rounded-md border border-input bg-input-background px-3 text-[15px]"
            >
              <option value="">No topic</option>
              {COMPOSER_TOPICS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            {topicHint ? (
              <p id="lounge-topic-hint" className="text-sm text-muted-foreground">
                {topicHint}
              </p>
            ) : null}
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
            <p className="text-sm text-muted-foreground">
              Something just for the {LOUNGE_TEAM_NAME}?{' '}
              <Link
                to={`/app/lounge/contact?from=${encodeURIComponent('/app/lounge/new')}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Contact Us
              </Link>
            </p>
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
 * Up to three screenshots or photos on a General question or a Win, with one
 * description for screen readers. Behind lounge_post_images.
 */
function AddImages({ error }: { error?: string }) {
  const [count, setCount] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="lounge-images" className="text-sm text-muted-foreground">
        Screenshots or photos (optional, up to {LOUNGE_IMAGE_MAX_COUNT})
      </label>
      <input
        id="lounge-images"
        name="images"
        type="file"
        multiple
        accept={LOUNGE_IMAGE_TYPES.join(',')}
        onChange={(event) => setCount(event.target.files?.length ?? 0)}
        aria-describedby="lounge-images-note"
        className="text-[15px] file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-dashed file:border-muted-foreground/50 file:bg-transparent file:px-4 file:text-[15px]"
      />
      <p id="lounge-images-note" className="text-sm text-muted-foreground">
        Crop out student names and faces first. We remove a photo&apos;s location before it&apos;s posted.
      </p>
      {count > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="lounge-image-alt" className="text-sm text-muted-foreground">
            Describe {count === 1 ? 'the image' : 'the images'}
          </label>
          <Input id="lounge-image-alt" name="imageAlt" required maxLength={300} placeholder="What it shows, in a few words" />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
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
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
      toggleRef.current?.focus();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    // A click anywhere outside the list closes it, not only the button.
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && !panelRef.current?.contains(target) && !toggleRef.current?.contains(target)) close();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Attach one of your YAWP! lessons</span>
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
          ref={toggleRef}
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
          <p className="border-b px-4 py-2 text-sm text-muted-foreground">Your assignments</p>
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

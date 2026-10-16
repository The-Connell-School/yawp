import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { HelpfulButton } from '~/components/lounge/helpful-button';
import { LoungeBody } from '~/components/lounge/lounge-body';
import { LoungeByline } from '~/components/lounge/lounge-byline';
import { MentionTextarea } from '~/components/lounge/mention-textarea';
import { LoungeVideoPlayer } from '~/components/lounge/lounge-video-player';
import { LoungeVideoRecorder } from '~/components/lounge/lounge-video-recorder';
import { FileText } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { requireLoungeAccess } from '~/domain/lounge/access.server';
import {
  LoungeNotFoundError,
  createLoungeReply,
  deleteOwnLoungePost,
  deleteOwnLoungeReply,
  getLoungeProfile,
  getLoungeThread,
  listMentionCandidates,
  recordShareUse,
  reportLoungeContent,
  setLoungePostPinned,
  toggleLoungeVote,
  type LoungeReplyView,
} from '~/domain/lounge/lounge.server';
import { canMembershipUseAssignmentType } from '~/domain/lounge/share-access.server';
import { loungeShareHref } from '~/domain/lounge/shares';
import { parseLoungeVideoInput, type LoungeVideo } from '~/domain/lounge/video';
import { loungeVideoPlaybackUrl } from '~/domain/lounge/video-storage.server';
import { decodeMentions } from '~/domain/lounge/mentions';
import { sendLoungeNotifications } from '~/domain/lounge/notifications.server';
import { formatLoungeTime } from '~/domain/lounge/time';
import { parseLoungeReplyInput } from '~/domain/lounge/validation';
import { getDomainUrl } from '~/utils/misc';
import { enforceAuthenticatedUserAndIp } from '~/utils/rate-limit.server';

function notFound() {
  return data({ error: 'This post is not available.' }, { status: 404 });
}

async function withPlayback(video: LoungeVideo | null) {
  return video ? { ...video, url: await loungeVideoPlaybackUrl(video.key) } : null;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { viewer, membership } = await requireLoungeAccess(request);
  const postId = params.postId ?? '';
  const thread = await getLoungeThread(viewer, postId);
  if (!thread) throw notFound();
  const [profile, candidates] = await Promise.all([
    getLoungeProfile(viewer.userId),
    listMentionCandidates(viewer, postId),
  ]);
  const now = new Date();
  const withWhen = async (reply: LoungeReplyView) => ({
    ...reply,
    when: formatLoungeTime(reply.createdAt, now),
    video: await withPlayback(reply.video),
  });
  const share = thread.post.attachment;
  const canUseShare =
    share && !thread.post.isOwn
      ? await canMembershipUseAssignmentType({
          membershipId: membership.id,
          organizationId: membership.organization.id,
          role: membership.role,
          assignmentTypeId: share.assignmentTypeId,
        })
      : false;
  return data({
    post: {
      ...thread.post,
      when: formatLoungeTime(thread.post.createdAt, now),
      video: await withPlayback(thread.post.video),
    },
    share: share ? { ...share, canUse: canUseShare } : null,
    staffReplies: await Promise.all(thread.staffReplies.map(withWhen)),
    replies: await Promise.all(thread.replies.map(withWhen)),
    candidates,
    isStaff: viewer.isStaff,
    canReply: viewer.isStaff || Boolean(profile),
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const access = await requireLoungeAccess(request);
  const { viewer } = access;
  const postId = params.postId ?? '';
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const replyId = form.get('replyId') ? String(form.get('replyId')) : null;

  try {
    switch (intent) {
      case 'reply': {
        if (!viewer.isStaff && !(await getLoungeProfile(viewer.userId))) {
          throw redirect(`/app/lounge/welcome?redirectTo=/app/lounge/${postId}`);
        }
        const fields = Object.fromEntries(form);
        const parsed = parseLoungeReplyInput(fields, { isStaff: viewer.isStaff });
        if (!parsed.ok) {
          return data({ intent, errors: parsed.errors, body: String(form.get('body') ?? '') }, { status: 400 });
        }
        const video = parseLoungeVideoInput(fields, { userId: viewer.userId, isStaff: viewer.isStaff });
        if (!video.ok) {
          return data({ intent, errors: video.errors, body: parsed.value.body }, { status: 400 });
        }
        const limit = await enforceAuthenticatedUserAndIp({
          request,
          route: 'lounge-reply',
          userId: viewer.userId,
          perUserPerHour: 60,
          perIpPerMinute: 20,
          perIpPerHour: 300,
        });
        if (!limit.allowed) {
          return data(
            {
              intent,
              errors: { body: 'You have replied a lot this hour. Please try again a little later.' },
              body: parsed.value.body,
            },
            { status: 429 }
          );
        }
        const result = await createLoungeReply({
          viewer,
          organizationId: access.organizationId,
          postId,
          input: { ...parsed.value, video: video.value },
        });
        void sendLoungeNotifications(result.notifications, getDomainUrl(request));
        throw redirect(`/app/lounge/${postId}#reply-${result.replyId}`);
      }
      case 'vote':
        return data({ intent, ...(await toggleLoungeVote(viewer, replyId ? { replyId } : { postId })) });
      case 'report':
        await reportLoungeContent(viewer, {
          postId,
          replyId,
          reason: String(form.get('reason') ?? ''),
        });
        return data({ intent, reported: true });
      case 'use-share': {
        const attachmentId = String(form.get('attachmentId') ?? '');
        const { assignmentTypeId } = await recordShareUse(viewer, attachmentId);
        throw redirect(loungeShareHref(assignmentTypeId, attachmentId));
      }
      case 'pin':
      case 'unpin':
        if (!viewer.isStaff) return data({ intent, error: 'Not allowed' }, { status: 403 });
        await setLoungePostPinned(viewer.userId, postId, intent === 'pin');
        return data({ intent, ok: true });
      case 'delete-post':
        await deleteOwnLoungePost(viewer, postId);
        throw redirect('/app/lounge');
      case 'delete-reply':
        if (replyId) await deleteOwnLoungeReply(viewer, replyId);
        throw redirect(`/app/lounge/${postId}`);
      default:
        return data({ intent, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof LoungeNotFoundError) throw notFound();
    throw error;
  }
}

type ReplyWithWhen = LoungeReplyView & { when: string };

export default function LoungeThreadRoute() {
  const { post, share, staffReplies, replies, candidates, canReply, isStaff } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const replyErrors =
    actionData && 'errors' in actionData && actionData.intent === 'reply' ? actionData.errors : undefined;
  const submitting = navigation.state === 'submitting' && navigation.formData?.get('intent') === 'reply';
  const retryBody = actionData && 'body' in actionData ? actionData.body : null;
  // Remount the reply box after each new reply so it starts empty again.
  const replyBoxKey = `${staffReplies.length + replies.length}-${retryBody === null ? 'fresh' : 'retry'}`;

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link to="/app/lounge" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
          ← Teacher&apos;s Lounge
        </Link>

        <article className="mt-3 flex flex-col gap-3">
          <h1 className="text-2xl font-bold leading-snug">{post.title}</h1>
          <p className="text-sm text-muted-foreground">
            <LoungeByline byline={post.author} when={post.when} /> ·{' '}
            <Link to={`/app/lounge?topic=${post.topic}`} className="hover:underline">
              {post.topicLabel}
            </Link>
          </p>
          {post.isPrivate ? (
            <p className="text-sm text-muted-foreground">Only you and the Yawp team can see this.</p>
          ) : null}
          {post.isHidden ? <p className="text-sm font-medium text-destructive">Hidden by the Yawp team.</p> : null}
          <LoungeBody body={post.body} className="text-base" />
          {post.video ? (
            <LoungeVideoPlayer
              url={post.video.url}
              title={post.video.title}
              durationSeconds={post.video.durationSeconds}
              label={`Video from ${post.author.name}`}
            />
          ) : null}
          {share ? <ShareCard share={share} isOwn={post.isOwn} /> : null}
          {post.staffStatus === 'OPEN' && staffReplies.length === 0 ? (
            <p className="text-sm font-medium text-primary">Waiting on the Yawp team</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <HelpfulButton count={post.helpfulCount} voted={post.viewerVoted} isOwn={post.isOwn} postId={post.id} />
            {canReply ? (
              <a href="#reply" className="hover:text-foreground">
                Reply
              </a>
            ) : null}
            <span className="ml-auto flex items-center gap-4">
              {isStaff ? (
                <Form method="post">
                  <input type="hidden" name="intent" value={post.isPinned ? 'unpin' : 'pin'} />
                  <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                    {post.isPinned ? 'Unpin' : 'Pin to top'}
                  </button>
                </Form>
              ) : null}
              {post.isOwn ? (
                <DeleteButton intent="delete-post" label="Delete post" />
              ) : (
                <ReportForm />
              )}
            </span>
          </div>
        </article>

        {staffReplies.length > 0 ? (
          <section aria-label="Answers from the Yawp team" className="mt-8 flex flex-col gap-4">
            {staffReplies.map((reply) => (
              <article
                key={reply.id}
                id={`reply-${reply.id}`}
                className="flex flex-col gap-3 border-l-[3px] border-primary bg-background px-5 py-4"
              >
                <LoungeByline byline={reply.author} when={reply.when} />
                <LoungeBody body={reply.body} className="text-base" />
                {reply.video ? (
                  <LoungeVideoPlayer
                    url={reply.video.url}
                    title={reply.video.title}
                    durationSeconds={reply.video.durationSeconds}
                    label={`Video answer from ${reply.author.name}`}
                  />
                ) : null}
                {reply.videoUrl ? (
                  <a
                    href={reply.videoUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="self-start text-sm font-medium text-primary underline"
                  >
                    Watch the video
                  </a>
                ) : null}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <HelpfulButton
                    count={reply.helpfulCount}
                    voted={reply.viewerVoted}
                    isOwn={reply.isOwn}
                    replyId={reply.id}
                  />
                  {reply.isOwn ? <DeleteButton intent="delete-reply" replyId={reply.id} label="Delete" /> : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        <section aria-label="Replies" className="mt-8">
          {replies.length > 0 ? (
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </h2>
          ) : null}
          {replies.map((reply: ReplyWithWhen) => (
            <article key={reply.id} id={`reply-${reply.id}`} className="flex flex-col gap-2 border-t py-5">
              <LoungeByline byline={reply.author} when={reply.when} />
              {reply.isHidden ? (
                <p className="text-sm font-medium text-destructive">Hidden by the Yawp team.</p>
              ) : null}
              <LoungeBody body={reply.body} />
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <HelpfulButton
                  count={reply.helpfulCount}
                  voted={reply.viewerVoted}
                  isOwn={reply.isOwn}
                  replyId={reply.id}
                />
                <span className="ml-auto">
                  {reply.isOwn ? (
                    <DeleteButton intent="delete-reply" replyId={reply.id} label="Delete" />
                  ) : (
                    <ReportForm replyId={reply.id} />
                  )}
                </span>
              </div>
            </article>
          ))}
        </section>

        <div id="reply" className="border-t pt-6">
          {canReply ? (
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="reply" />
              <label htmlFor="lounge-reply" className="text-sm text-muted-foreground">
                Your reply
              </label>
              <MentionTextarea
                key={replyBoxKey}
                id="lounge-reply"
                name="body"
                rows={3}
                candidates={candidates}
                defaultText={retryBody ? decodeMentions(retryBody).text : ''}
                defaultMentions={retryBody ? decodeMentions(retryBody).mentions : []}
                placeholder="Type @ to mention Brian or someone in this thread."
                aria-invalid={Boolean(replyErrors?.body)}
              />
              {isStaff ? (
                <>
                  <LoungeVideoRecorder key={replyBoxKey} />
                  <div className="flex flex-col gap-1">
                    <label htmlFor="lounge-video" className="text-sm text-muted-foreground">
                      Or a video link (optional)
                    </label>
                    <Input id="lounge-video" name="videoUrl" type="url" placeholder="https://www.loom.com/share/…" />
                  </div>
                </>
              ) : null}
              {replyErrors
                ? Object.values(replyErrors).map((message) => (
                    <p key={message} role="alert" className="text-sm text-destructive">
                      {message}
                    </p>
                  ))
                : null}
              <div>
                <Button type="submit" disabled={submitting}>
                  Post reply
                </Button>
              </div>
            </Form>
          ) : (
            <Link
              to={`/app/lounge/welcome?redirectTo=/app/lounge/${post.id}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
            >
              Choose how you appear to reply
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

type ShareView = {
  id: string;
  title: string;
  typeTitle: string;
  prompt: string;
  useCount: number;
  viewerUsed: boolean;
  canUse: boolean;
};

/** One small card and one button. Preview is tucked away until asked for. */
function ShareCard({ share, isOwn }: { share: ShareView; isOwn: boolean }) {
  const navigation = useNavigation();
  const using = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'use-share';
  const used = `used by ${share.useCount} ${share.useCount === 1 ? 'teacher' : 'teachers'}`;
  return (
    <section
      aria-label="Shared from Yawp"
      className="flex flex-col gap-3 rounded-xl border bg-background px-4 py-3.5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText size={20} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{share.title}</span>
          <span className="text-sm text-muted-foreground">
            {share.typeTitle} · {used}
          </span>
        </span>
      </div>
      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-muted-foreground underline-offset-2 hover:underline">
          Preview
        </summary>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2.5 leading-relaxed text-foreground">
          {share.prompt}
        </p>
      </details>
      {isOwn ? (
        <p className="text-sm text-muted-foreground">Shared from your assignments</p>
      ) : share.canUse ? (
        <Form method="post" className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="intent" value="use-share" />
          <input type="hidden" name="attachmentId" value={share.id} />
          <Button type="submit" disabled={using}>
            Use in my class
          </Button>
          <span className="text-sm text-muted-foreground">
            {share.viewerUsed
              ? 'You used this before. It opens a new copy.'
              : 'Opens the assignment form with this prompt. You pick the classes.'}
          </span>
        </Form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your school doesn&apos;t offer {share.typeTitle} yet.
        </p>
      )}
    </section>
  );
}

function DeleteButton({ intent, replyId, label }: { intent: string; replyId?: string; label: string }) {
  return (
    <Form
      method="post"
      onSubmit={(event) => {
        if (!window.confirm('Delete this for everyone? This cannot be undone.')) event.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      {replyId ? <input type="hidden" name="replyId" value={replyId} /> : null}
      <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
        {label}
      </button>
    </Form>
  );
}

function ReportForm({ replyId }: { replyId?: string }) {
  const fetcher = useFetcher<{ reported?: boolean }>();
  if (fetcher.data?.reported) {
    return <span className="text-sm">Thanks. The Yawp team will take a look.</span>;
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer list-none text-muted-foreground hover:text-foreground">Report</summary>
      <fetcher.Form method="post" className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="intent" value="report" />
        {replyId ? <input type="hidden" name="replyId" value={replyId} /> : null}
        <label className="flex flex-col gap-1 text-muted-foreground">
          What is wrong?
          <Input name="reason" maxLength={500} className="h-9 w-56" />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Send report
        </Button>
      </fetcher.Form>
    </details>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

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
import { LoungeAvatar } from '~/components/lounge/lounge-avatar';
import { MentionTextarea } from '~/components/lounge/mention-textarea';
import { LoungeVideoPlayer } from '~/components/lounge/lounge-video-player';
import { LoungeVideoRecorder } from '~/components/lounge/lounge-video-recorder';
import { ChevronLeft, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LocalTime } from '~/components/lounge/local-time';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { requireLoungeMember } from '~/domain/lounge/access.server';
import { LOUNGE_NAME, LOUNGE_TEAM_NAME } from '~/domain/lounge/launch';
import {
  LoungeNotFoundError,
  createLoungeReply,
  deleteOwnLoungePost,
  deleteOwnLoungeReply,
  editOwnLoungePost,
  editOwnLoungeReply,
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
import { parseLoungePostEdit, parseLoungeReplyEdit, parseLoungeReplyInput } from '~/domain/lounge/validation';
import { getDomainUrl } from '~/utils/misc';
import { enforceAuthenticatedUserAndIp } from '~/utils/rate-limit.server';

function notFound() {
  return data({ error: 'This post is not available.' }, { status: 404 });
}

async function withPlayback(video: LoungeVideo | null) {
  return video ? { ...video, url: await loungeVideoPlaybackUrl(video.key) } : null;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { viewer, membership } = await requireLoungeMember(request);
  const postId = params.postId ?? '';
  const thread = await getLoungeThread(viewer, postId);
  if (!thread) throw notFound();
  const candidates = await listMentionCandidates(viewer, postId);
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
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const access = await requireLoungeMember(request);
  const { viewer } = access;
  const postId = params.postId ?? '';
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const replyId = form.get('replyId') ? String(form.get('replyId')) : null;

  try {
    switch (intent) {
      case 'reply': {
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
      case 'edit-post': {
        const parsed = parseLoungePostEdit(Object.fromEntries(form));
        if (!parsed.ok) return data({ intent, errors: parsed.errors }, { status: 400 });
        if (!(await editOwnLoungePost(viewer, postId, parsed.value))) throw notFound();
        throw redirect(`/app/lounge/${postId}`);
      }
      case 'edit-reply': {
        const parsed = parseLoungeReplyEdit(Object.fromEntries(form));
        if (!parsed.ok) return data({ intent, replyId, errors: parsed.errors }, { status: 400 });
        if (!replyId || !(await editOwnLoungeReply(viewer, replyId, parsed.value))) throw notFound();
        throw redirect(`/app/lounge/${postId}#reply-${replyId}`);
      }
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

type ReplyWithWhen = Omit<LoungeReplyView, 'video'> & {
  when: string;
  video: (LoungeVideo & { url: string | null }) | null;
};
type Candidates = Parameters<typeof MentionTextarea>[0]['candidates'];

/**
 * Close an edit form once its save has gone through. A save redirects back
 * to this same page, which keeps component state, so the form would
 * otherwise stay open; a save that comes back with errors keeps it open.
 */
function useCloseAfterSave(intent: string, replyId: string | null, close: () => void) {
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const saving = useRef(false);
  useEffect(() => {
    const form = navigation.formData;
    if (navigation.state !== 'idle') {
      if (form?.get('intent') === intent && (replyId === null || form.get('replyId') === replyId)) saving.current = true;
      return;
    }
    if (!saving.current) return;
    saving.current = false;
    const failed = actionData && 'errors' in actionData && actionData.intent === intent;
    if (!failed) close();
  }, [navigation.state, navigation.formData, actionData, intent, replyId, close]);
}

function EditPostForm({
  title,
  body,
  candidates,
  onCancel,
}: {
  title: string;
  body: string;
  candidates: Candidates;
  onCancel: () => void;
}) {
  const actionData = useActionData<typeof action>();
  const errors =
    actionData && 'errors' in actionData && actionData.intent === 'edit-post' ? actionData.errors : undefined;
  const initial = decodeMentions(body);
  return (
    <Form method="post" className="flex flex-col gap-3">
      <input type="hidden" name="intent" value="edit-post" />
      <label htmlFor="edit-post-title" className="text-sm text-muted-foreground">
        Edit title
      </label>
      <Input id="edit-post-title" name="title" defaultValue={title} className="h-12 text-lg" />
      <label htmlFor="edit-post-body" className="text-sm text-muted-foreground">
        Edit details
      </label>
      <MentionTextarea
        id="edit-post-body"
        name="body"
        rows={10}
        candidates={candidates}
        defaultText={initial.text}
        defaultMentions={initial.mentions}
      />
      <FormErrors errors={errors} />
      <div className="flex gap-3">
        <Button type="submit">Save changes</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Form>
  );
}

function FormErrors({ errors }: { errors?: Record<string, string | undefined> }) {
  if (!errors) return null;
  return (
    <>
      {Object.values(errors).map((message) => (
        <p key={message} role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ))}
    </>
  );
}

/** One reply: a YAWP! team answer (accented) or a teacher's reply. Authors can edit their own. */
const KIND_LABEL = { QUESTION: 'Question', SHARE: 'Share', WIN: 'Win' } as const;

/** Avatar, name, and a quiet second line: school or team, when, edited. */
function AuthorLine({
  author,
  avatar,
  when,
  edited,
}: {
  author: LoungeReplyView['author'];
  avatar: LoungeReplyView['avatar'];
  when: string;
  edited: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <LoungeAvatar avatar={avatar} />
      <div className="flex flex-col leading-snug">
        <span className="font-medium">{author.name}</span>
        <span className="text-sm text-muted-foreground">
          {[author.detail, when, edited ? 'edited' : null].filter(Boolean).join(' · ')}
        </span>
      </div>
    </div>
  );
}

const QUIET_ACTION = 'inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground hover:text-foreground';

/**
 * One reply. A YAWP! team answer is its own card with a "<name>'s answer"
 * badge; a teacher's reply is an avatar row. Authors can edit their own.
 */
function ReplyItem({
  reply,
  candidates,
  variant,
}: {
  reply: ReplyWithWhen;
  candidates: Candidates;
  variant: 'staff' | 'community';
}) {
  const [editing, setEditing] = useState(false);
  useCloseAfterSave('edit-reply', reply.id, () => setEditing(false));
  const actionData = useActionData<typeof action>();
  const errors =
    actionData && 'errors' in actionData && actionData.intent === 'edit-reply' && actionData.replyId === reply.id
      ? actionData.errors
      : undefined;
  const initial = decodeMentions(reply.body);
  const staff = variant === 'staff';
  const firstName = reply.author.name.trim().split(/\s+/)[0];

  const content = (
    <>
      {reply.isHidden ? (
        <p className="text-sm font-medium text-destructive">Hidden by the {LOUNGE_TEAM_NAME}.</p>
      ) : null}
      {editing ? (
        <Form method="post" className="flex flex-col gap-2">
          <input type="hidden" name="intent" value="edit-reply" />
          <input type="hidden" name="replyId" value={reply.id} />
          <label htmlFor={`edit-reply-${reply.id}`} className="sr-only">
            Edit reply
          </label>
          <MentionTextarea
            id={`edit-reply-${reply.id}`}
            name="body"
            rows={4}
            candidates={candidates}
            defaultText={initial.text}
            defaultMentions={initial.mentions}
          />
          <div className="flex gap-3">
            <Button type="submit" size="sm">
              Save changes
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </Form>
      ) : (
        <LoungeBody body={reply.body} className={staff ? 'text-[17px] leading-[1.65]' : 'text-base'} />
      )}
      <FormErrors errors={errors} />
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
          className="lounge-accent self-start text-sm font-medium underline"
        >
          Watch the video
        </a>
      ) : null}
      <div className={staff ? '-mx-2 flex flex-wrap items-center gap-2 border-t pt-2' : '-mx-2 flex flex-wrap items-center gap-2'}>
        <span className="px-2">
          <HelpfulButton count={reply.helpfulCount} voted={reply.viewerVoted} isOwn={reply.isOwn} replyId={reply.id} />
        </span>
        <a href="#reply" className={QUIET_ACTION}>
          Reply
        </a>
        <span className="ml-auto flex items-center gap-1">
          {reply.isOwn && !editing ? (
            <button type="button" onClick={() => setEditing(true)} className={QUIET_ACTION}>
              Edit
            </button>
          ) : null}
          {reply.isOwn ? (
            <DeleteButton intent="delete-reply" replyId={reply.id} label="Delete" />
          ) : staff ? null : (
            <ReportForm replyId={reply.id} />
          )}
        </span>
      </div>
    </>
  );

  if (staff) {
    return (
      <article id={`reply-${reply.id}`} className="flex flex-col gap-4 rounded-2xl border bg-popover p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AuthorLine author={reply.author} avatar={reply.avatar} when={reply.when} edited={reply.isEdited} />
          <span className="lounge-accent lounge-accent-soft rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide">
            {firstName}&apos;s answer
          </span>
        </div>
        {content}
      </article>
    );
  }

  return (
    <article id={`reply-${reply.id}`} className="flex gap-4 border-t py-6">
      <LoungeAvatar avatar={reply.avatar} size="md" className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{reply.author.name}</span>
          {[reply.author.detail, reply.when, reply.isEdited ? 'edited' : null]
            .filter(Boolean)
            .map((part) => ` · ${part}`)
            .join('')}
        </p>
        {content}
      </div>
    </article>
  );
}

export default function LoungeThreadRoute() {
  const { post, share, staffReplies, replies, candidates, isStaff } = useLoaderData<typeof loader>();
  const [editingPost, setEditingPost] = useState(false);
  useCloseAfterSave('edit-post', null, () => setEditingPost(false));
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
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
        <Link
          to="/app/lounge"
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {LOUNGE_NAME}
        </Link>

        <article className="-mt-4 flex flex-col gap-4">
          {post.isUnpublished ? (
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium">
              {post.isDraft ? (
                <>Draft. Only the {LOUNGE_TEAM_NAME} can see this.</>
              ) : (
                <>
                  Scheduled for <LocalTime iso={post.createdAt} />. Only the {LOUNGE_TEAM_NAME} can see it until then.
                </>
              )}
            </p>
          ) : null}
          {editingPost ? (
            <EditPostForm
              title={post.title}
              body={post.body}
              candidates={candidates}
              onCancel={() => setEditingPost(false)}
            />
          ) : (
            <>
              <p className="lounge-accent text-xs font-medium uppercase tracking-[0.08em]">
                {KIND_LABEL[post.kind]}
                {post.topic === 'other' ? null : (
                  <>
                    {' · '}
                    <Link to={`/app/lounge?topic=${post.topic}`} className="hover:underline">
                      {post.topicLabel}
                    </Link>
                  </>
                )}
              </p>
              <h1 className="lounge-serif text-[34px] leading-[1.1] text-foreground sm:text-[42px]">{post.title}</h1>
              <AuthorLine author={post.author} avatar={post.avatar} when={post.when} edited={post.isEdited} />
            </>
          )}
          {post.isPrivate ? (
            <p className="text-sm text-muted-foreground">Only you and the {LOUNGE_TEAM_NAME} can see this.</p>
          ) : null}
          {post.isHidden ? <p className="text-sm font-medium text-destructive">Hidden by the {LOUNGE_TEAM_NAME}.</p> : null}
          {editingPost ? null : (
            <LoungeBody body={post.body} className="text-[17px] leading-[1.65]" testId="lounge-post-body" />
          )}
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
            <p className="lounge-accent text-sm font-medium">Waiting on the {LOUNGE_TEAM_NAME}</p>
          ) : null}
          <div className="-mx-2 flex flex-wrap items-center gap-2 border-b pb-2">
            <span className="px-2">
              <HelpfulButton count={post.helpfulCount} voted={post.viewerVoted} isOwn={post.isOwn} postId={post.id} />
            </span>
            <a href="#reply" className={QUIET_ACTION}>
              Reply
            </a>
            <span className="ml-auto flex items-center gap-1">
              {isStaff ? (
                <Form method="post">
                  <input type="hidden" name="intent" value={post.isPinned ? 'unpin' : 'pin'} />
                  <button type="submit" className={QUIET_ACTION}>
                    {post.isPinned ? 'Unpin' : 'Pin to top'}
                  </button>
                </Form>
              ) : null}
              {post.isOwn && !editingPost ? (
                <button type="button" onClick={() => setEditingPost(true)} className={QUIET_ACTION}>
                  Edit post
                </button>
              ) : null}
              {post.isOwn ? <DeleteButton intent="delete-post" label="Delete post" /> : <ReportForm />}
            </span>
          </div>
        </article>

        {staffReplies.length > 0 ? (
          <section aria-label={`Answers from the ${LOUNGE_TEAM_NAME}`} className="flex flex-col gap-4">
            {staffReplies.map((reply) => (
              <ReplyItem key={reply.id} reply={reply} candidates={candidates} variant="staff" />
            ))}
          </section>
        ) : null}

        <section aria-label="Replies">
          {replies.length > 0 ? (
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </h2>
          ) : null}
          {replies.map((reply) => (
            <ReplyItem key={reply.id} reply={reply} candidates={candidates} variant="community" />
          ))}
        </section>

        <div id="reply" className="-mt-8 border-t pt-6">
          <Form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="intent" value="reply" />
            <label htmlFor="lounge-reply" className="text-sm text-muted-foreground">
              Your reply
            </label>
            <MentionTextarea
              key={replyBoxKey}
              id="lounge-reply"
              name="body"
              rows={4}
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
      aria-label="Shared from YAWP!"
      className="flex flex-col gap-3 rounded-xl border bg-background px-4 py-3.5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg lounge-accent-soft lounge-accent">
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
      <button type="submit" className={QUIET_ACTION}>
        {label}
      </button>
    </Form>
  );
}

function ReportForm({ replyId }: { replyId?: string }) {
  const fetcher = useFetcher<{ reported?: boolean }>();
  if (fetcher.data?.reported) {
    return <span className="text-sm">Thanks. The {LOUNGE_TEAM_NAME} will take a look.</span>;
  }
  return (
    <details className="text-sm">
      <summary className={`cursor-pointer list-none ${QUIET_ACTION}`}>Report</summary>
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

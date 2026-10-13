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
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { LoungeBody } from '~/components/lounge/lounge-body';
import { LoungeByline } from '~/components/lounge/lounge-byline';
import { MentionTextarea } from '~/components/lounge/mention-textarea';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  LoungeNotFoundError,
  closeLoungeStaffRequest,
  createLoungeReply,
  dismissLoungeReport,
  getLoungeThread,
  hideLoungeContent,
  listLoungeStaffInbox,
  listMentionCandidates,
} from '~/domain/lounge/lounge.server';
import { sendLoungeNotifications } from '~/domain/lounge/notifications.server';
import { formatLoungeTime } from '~/domain/lounge/time';
import { parseLoungeReplyInput } from '~/domain/lounge/validation';
import { requireAdmin } from '~/utils/auth.server';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { prisma } from '~/utils/db.server';
import { cn, getDomainUrl } from '~/utils/misc';

export const handle: BreadcrumbHandle = { breadcrumb: 'Lounge' };

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const viewer = { userId: admin.id, isStaff: true };
  const url = new URL(request.url);
  const now = new Date();
  const inbox = await listLoungeStaffInbox();
  const selectedId = url.searchParams.get('post') ?? inbox.waiting[0]?.id ?? null;
  const [thread, candidates] = selectedId
    ? await Promise.all([getLoungeThread(viewer, selectedId), listMentionCandidates(viewer, selectedId)])
    : [null, []];
  return data({
    waiting: inbox.waiting.map((item) => ({ ...item, waitingFor: formatLoungeTime(item.requestedAt, now) })),
    reports: inbox.reports.map((item) => ({ ...item, when: formatLoungeTime(item.createdAt, now) })),
    selected: thread
      ? {
          id: thread.post.id,
          title: thread.post.title,
          body: thread.post.body,
          author: thread.post.author,
          isPrivate: thread.post.isPrivate,
          staffStatus: thread.post.staffStatus,
          replyCount: thread.replies.length + thread.staffReplies.length,
        }
      : null,
    candidates,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const viewer = { userId: admin.id, isStaff: true };
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const postId = String(form.get('postId') ?? '');

  try {
    switch (intent) {
      case 'reply': {
        const parsed = parseLoungeReplyInput(Object.fromEntries(form), { isStaff: true });
        if (!parsed.ok) return data({ errors: parsed.errors }, { status: 400 });
        const membership = await prisma.orgMembership.findFirst({
          where: { userId: admin.id, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { organizationId: true },
        });
        const result = await createLoungeReply({
          viewer,
          organizationId: membership?.organizationId ?? null,
          postId,
          input: parsed.value,
        });
        void sendLoungeNotifications(result.notifications, getDomainUrl(request));
        throw redirect('/app/admin/lounge');
      }
      case 'close':
        await closeLoungeStaffRequest(postId);
        throw redirect('/app/admin/lounge');
      case 'hide': {
        const replyId = form.get('replyId') ? String(form.get('replyId')) : null;
        await hideLoungeContent(admin.id, replyId ? { replyId } : { postId });
        return data({ ok: true });
      }
      case 'dismiss':
        await dismissLoungeReport(admin.id, String(form.get('reportId') ?? ''));
        return data({ ok: true });
      default:
        return data({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof LoungeNotFoundError) {
      return data({ errors: { body: 'That post is gone.' } }, { status: 404 });
    }
    throw error;
  }
}

export default function AdminLoungeRoute() {
  const { waiting, reports, selected, candidates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const errors = actionData && 'errors' in actionData ? actionData.errors : undefined;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <div className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-bold">Lounge inbox</h1>
        <p className="text-sm text-muted-foreground">
          {waiting.length} waiting for the Yawp team · {reports.length} open{' '}
          {reports.length === 1 ? 'report' : 'reports'}
        </p>
      </div>

      <div className="flex flex-wrap gap-8">
        <section aria-label="Waiting for the Yawp team" className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
          {waiting.length === 0 ? (
            <p className="py-4 text-muted-foreground">Nothing waiting. Nice.</p>
          ) : (
            waiting.map((item) => (
              <Link
                key={item.id}
                to={`/app/admin/lounge?post=${item.id}`}
                aria-current={selected?.id === item.id ? 'true' : undefined}
                className={cn(
                  'flex flex-col gap-1 rounded-lg p-3 hover:bg-secondary',
                  selected?.id === item.id && 'bg-secondary'
                )}
              >
                <span className="font-medium leading-snug">{item.title}</span>
                <span className="text-sm text-muted-foreground">
                  {item.author.name}
                  {item.author.detail ? ` · ${item.author.detail}` : ''} · {item.waitingFor}
                  {item.isPrivate ? ' · private' : ''}
                </span>
              </Link>
            ))
          )}
        </section>

        {selected ? (
          <section aria-label="Selected question" className="flex min-w-0 flex-[2_1_420px] flex-col gap-4">
            <h2 className="text-xl font-bold leading-snug">{selected.title}</h2>
            <p className="text-sm text-muted-foreground">
              <LoungeByline byline={selected.author} /> ·{' '}
              {selected.isPrivate ? 'wants a private reply' : 'public question'} ·{' '}
              <Link to={`/app/lounge/${selected.id}`} className="underline">
                open thread ({selected.replyCount} {selected.replyCount === 1 ? 'reply' : 'replies'})
              </Link>
            </p>
            <LoungeBody body={selected.body} />
            {selected.staffStatus === 'OPEN' ? (
              <Form method="post" className="flex flex-col gap-3 border-t pt-4">
                <input type="hidden" name="postId" value={selected.id} />
                <label htmlFor="staff-reply" className="text-sm text-muted-foreground">
                  Reply as the Yawp team
                </label>
                <MentionTextarea
                  key={selected.id}
                  id="staff-reply"
                  name="body"
                  rows={5}
                  candidates={candidates}
                  placeholder="Short version first. Then the why."
                />
                <label htmlFor="staff-video" className="text-sm text-muted-foreground">
                  Video link (optional)
                </label>
                <Input id="staff-video" name="videoUrl" type="url" placeholder="https://www.loom.com/share/…" />
                {errors
                  ? Object.values(errors).map((message) => (
                      <p key={String(message)} role="alert" className="text-sm text-destructive">
                        {String(message)}
                      </p>
                    ))
                  : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" name="intent" value="reply" disabled={navigation.state === 'submitting'}>
                    Post reply
                  </Button>
                  <Button type="submit" name="intent" value="close" variant="ghost">
                    Close without reply
                  </Button>
                </div>
              </Form>
            ) : (
              <p className="text-sm text-muted-foreground">This one is no longer waiting.</p>
            )}
          </section>
        ) : null}
      </div>

      <section aria-label="Reports" className="flex flex-col gap-2 border-t pt-6">
        <h2 className="text-lg font-bold">Reports</h2>
        {reports.length === 0 ? (
          <p className="text-muted-foreground">No open reports.</p>
        ) : (
          reports.map((report) => (
            <article key={report.id} className="flex flex-col gap-2 rounded-lg border bg-background p-4">
              <p className="text-sm text-muted-foreground">
                {report.reporter.name} reported a {report.replyId ? 'reply' : 'post'} in{' '}
                <Link to={`/app/lounge/${report.postId}`} className="underline">
                  {report.postTitle}
                </Link>{' '}
                · {report.when}
              </p>
              <p className="font-medium">{report.reason}</p>
              <p className="line-clamp-3 text-sm">{report.excerpt}</p>
              <Form method="post" className="flex gap-2">
                <input type="hidden" name="postId" value={report.postId} />
                {report.replyId ? <input type="hidden" name="replyId" value={report.replyId} /> : null}
                <input type="hidden" name="reportId" value={report.id} />
                <Button type="submit" name="intent" value="hide" size="sm" variant="outline">
                  Hide
                </Button>
                <Button type="submit" name="intent" value="dismiss" size="sm" variant="ghost">
                  Dismiss
                </Button>
              </Form>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

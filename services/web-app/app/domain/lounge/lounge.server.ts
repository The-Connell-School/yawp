/**
 * Teacher's Lounge community board: reads and writes. Every function takes
 * the viewer explicitly; callers get the viewer from requireLoungeAccess.
 *
 * Visibility rules, in one place:
 * - deleted posts and replies are gone for everyone;
 * - hidden ones (moderated) are gone for teachers and still visible to staff
 *   in a thread, so the Yawp team can see what it hid;
 * - a STAFF_ONLY post is visible to its author and the Yawp team only, and
 *   never appears in the community feed for anyone but its author.
 */
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { loungeByline, type LoungeDisplayNameStyleKey } from './display-name';
import { mentionedUserIds, plainTextWithMentions } from './mentions';
import { sortByTop } from './ranking';
import { loungeTopicLabel, type LoungePostKindKey } from './topics';
import type { LoungePostInput, LoungeReplyInput } from './validation';

export type LoungeViewer = { userId: string; isStaff: boolean };
export type LoungeSort = 'new' | 'top' | 'unanswered';
export type LoungeByline = { name: string; detail: string | null };

export class LoungeNotFoundError extends Error {
  constructor() {
    super('Lounge post not found');
  }
}

export type LoungeNotification =
  | {
      kind: 'reply';
      toUserId: string;
      postId: string;
      postTitle: string;
      actorName: string;
      actorIsStaff: boolean;
      excerpt: string;
    }
  | {
      kind: 'mention';
      toUserId: string;
      postId: string;
      postTitle: string;
      actorName: string;
      actorIsStaff: boolean;
      excerpt: string;
    }
  | {
      kind: 'staff-request';
      postId: string;
      postTitle: string;
      actorName: string;
      excerpt: string;
      isPrivate: boolean;
    };

const PAGE_SIZE = 30;
const TOP_WINDOW_DAYS = 30;
const TOP_CANDIDATES = 200;
const MAX_STAFF_CANDIDATES = 12;

const authorSelect = {
  id: true,
  name: true,
  isAdmin: true,
  loungeProfile: { select: { displayNameStyle: true } },
} satisfies Prisma.UserSelect;

type AuthorRow = Prisma.UserGetPayload<{ select: typeof authorSelect }>;

function bylineFor(
  author: AuthorRow,
  schoolName: string | null | undefined,
  isStaff: boolean
): LoungeByline {
  return loungeByline({
    name: author.name,
    style: (author.loungeProfile?.displayNameStyle ?? null) as LoungeDisplayNameStyleKey | null,
    schoolName,
    isStaff,
  });
}

function excerptOf(body: string, length = 280): string {
  const text = plainTextWithMentions(body).replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

const liveReply = { deletedAt: null, hiddenAt: null } satisfies Prisma.LoungeReplyWhereInput;

function feedWhere(viewer: LoungeViewer, topic?: string | null): Prisma.LoungePostWhereInput {
  return {
    deletedAt: null,
    hiddenAt: null,
    ...(topic ? { topic } : {}),
    OR: [{ visibility: 'COMMUNITY' }, { authorUserId: viewer.userId }],
  };
}

function summarySelect(viewer: LoungeViewer) {
  return {
    id: true,
    createdAt: true,
    kind: true,
    topic: true,
    title: true,
    visibility: true,
    authorUserId: true,
    author: { select: authorSelect },
    organization: { select: { name: true } },
    replies: { where: { ...liveReply, isStaff: true }, select: { id: true }, take: 1 },
    votes: { where: { userId: viewer.userId }, select: { id: true }, take: 1 },
    _count: { select: { replies: { where: liveReply }, votes: true } },
  } satisfies Prisma.LoungePostSelect;
}

type SummaryRow = Prisma.LoungePostGetPayload<{ select: ReturnType<typeof summarySelect> }>;

export type LoungePostSummary = {
  id: string;
  kind: LoungePostKindKey;
  topic: string;
  topicLabel: string;
  title: string;
  createdAt: string;
  author: LoungeByline;
  replyCount: number;
  helpfulCount: number;
  viewerVoted: boolean;
  staffAnswered: boolean;
  isPrivate: boolean;
  isOwn: boolean;
};

function toSummary(row: SummaryRow, viewer: LoungeViewer): LoungePostSummary {
  return {
    id: row.id,
    kind: row.kind,
    topic: row.topic,
    topicLabel: loungeTopicLabel(row.topic),
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    author: bylineFor(row.author, row.organization?.name, row.author.isAdmin),
    replyCount: row._count.replies,
    helpfulCount: row._count.votes,
    viewerVoted: row.votes.length > 0,
    staffAnswered: row.replies.length > 0,
    isPrivate: row.visibility === 'STAFF_ONLY',
    isOwn: row.authorUserId === viewer.userId,
  };
}

export async function listLoungePosts(
  viewer: LoungeViewer,
  options: { sort: LoungeSort; topic?: string | null; before?: string | null; now?: Date }
): Promise<{ posts: LoungePostSummary[]; nextCursor: string | null }> {
  const now = options.now ?? new Date();
  const select = summarySelect(viewer);
  const base = feedWhere(viewer, options.topic);

  if (options.sort === 'top') {
    const since = new Date(now.getTime() - TOP_WINDOW_DAYS * 86_400_000);
    const rows = await prisma.loungePost.findMany({
      where: { ...base, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: TOP_CANDIDATES,
      select,
    });
    const ranked = sortByTop(
      rows.map((row) => ({
        row,
        helpful: row._count.votes,
        replies: row._count.replies,
        createdAt: row.createdAt,
      })),
      now
    );
    return {
      posts: ranked.slice(0, PAGE_SIZE).map(({ row }) => toSummary(row, viewer)),
      nextCursor: null,
    };
  }

  const before = options.before ? new Date(options.before) : null;
  const where: Prisma.LoungePostWhereInput = {
    ...base,
    ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
    ...(options.sort === 'unanswered'
      ? { kind: 'QUESTION', replies: { none: liveReply } }
      : {}),
  };
  const rows = await prisma.loungePost.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    select,
  });
  const page = rows.slice(0, PAGE_SIZE);
  return {
    posts: page.map((row) => toSummary(row, viewer)),
    nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].createdAt.toISOString() : null,
  };
}

export type LoungeReplyView = {
  id: string;
  createdAt: string;
  body: string;
  author: LoungeByline;
  isStaff: boolean;
  videoUrl: string | null;
  helpfulCount: number;
  viewerVoted: boolean;
  isOwn: boolean;
  isHidden: boolean;
};

export type LoungeThread = {
  post: LoungePostSummary & {
    body: string;
    staffStatus: 'OPEN' | 'ANSWERED' | 'CLOSED' | null;
    isHidden: boolean;
  };
  staffReplies: LoungeReplyView[];
  replies: LoungeReplyView[];
};

async function findVisiblePost(viewer: LoungeViewer, postId: string) {
  const post = await prisma.loungePost.findFirst({
    where: { id: postId, deletedAt: null },
    select: { id: true, title: true, authorUserId: true, visibility: true, hiddenAt: true, staffStatus: true },
  });
  if (!post) return null;
  if (post.hiddenAt && !viewer.isStaff) return null;
  if (post.visibility === 'STAFF_ONLY' && !viewer.isStaff && post.authorUserId !== viewer.userId) {
    return null;
  }
  return post;
}

export async function getLoungeThread(
  viewer: LoungeViewer,
  postId: string
): Promise<LoungeThread | null> {
  if (!(await findVisiblePost(viewer, postId))) return null;
  const row = await prisma.loungePost.findUnique({
    where: { id: postId },
    select: {
      ...summarySelect(viewer),
      body: true,
      staffStatus: true,
      hiddenAt: true,
    },
  });
  if (!row) return null;
  const replyRows = await prisma.loungeReply.findMany({
    where: { postId, deletedAt: null, ...(viewer.isStaff ? {} : { hiddenAt: null }) },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      body: true,
      isStaff: true,
      videoUrl: true,
      hiddenAt: true,
      authorUserId: true,
      author: { select: authorSelect },
      organization: { select: { name: true } },
      votes: { where: { userId: viewer.userId }, select: { id: true }, take: 1 },
      _count: { select: { votes: true } },
    },
  });
  const views: LoungeReplyView[] = replyRows.map((reply) => ({
    id: reply.id,
    createdAt: reply.createdAt.toISOString(),
    body: reply.body,
    author: bylineFor(reply.author, reply.organization?.name, reply.isStaff),
    isStaff: reply.isStaff,
    videoUrl: reply.videoUrl,
    helpfulCount: reply._count.votes,
    viewerVoted: reply.votes.length > 0,
    isOwn: reply.authorUserId === viewer.userId,
    isHidden: reply.hiddenAt !== null,
  }));
  return {
    post: {
      ...toSummary(row, viewer),
      body: row.body,
      staffStatus: row.staffStatus,
      isHidden: row.hiddenAt !== null,
    },
    staffReplies: views.filter((reply) => reply.isStaff),
    replies: views.filter((reply) => !reply.isStaff),
  };
}

/** Users a viewer may @mention: staff anywhere; teachers only once they are in the thread. */
async function allowedMentionIds(
  viewer: LoungeViewer,
  postId: string | null,
  candidateIds: string[]
): Promise<Set<string>> {
  const ids = candidateIds.filter((id) => id !== viewer.userId);
  if (ids.length === 0) return new Set();
  const participants = postId ? await threadParticipantIds(postId) : new Set<string>();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, isAdmin: true },
  });
  return new Set(
    users.filter((user) => user.isAdmin || participants.has(user.id)).map((user) => user.id)
  );
}

async function threadParticipantIds(postId: string): Promise<Set<string>> {
  const post = await prisma.loungePost.findUnique({
    where: { id: postId },
    select: {
      authorUserId: true,
      replies: { where: { deletedAt: null }, select: { authorUserId: true } },
    },
  });
  if (!post) return new Set();
  return new Set([post.authorUserId, ...post.replies.map((reply) => reply.authorUserId)]);
}

function dedupeNotifications(notifications: LoungeNotification[]): LoungeNotification[] {
  const seen = new Set<string>();
  return notifications.filter((notification) => {
    if (notification.kind === 'staff-request') return true;
    if (seen.has(notification.toUserId)) return false;
    seen.add(notification.toUserId);
    return true;
  });
}

async function actorName(viewer: LoungeViewer, organizationId: string | null): Promise<string> {
  const [author, organization] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: viewer.userId }, select: authorSelect }),
    organizationId
      ? prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
      : null,
  ]);
  return bylineFor(author, organization?.name, viewer.isStaff).name;
}

export async function createLoungePost(params: {
  viewer: LoungeViewer;
  organizationId: string | null;
  input: LoungePostInput;
}): Promise<{ postId: string; notifications: LoungeNotification[] }> {
  const { viewer, input } = params;
  const mentioned = await allowedMentionIds(viewer, null, mentionedUserIds(input.body));
  const staffMentioned = mentioned.size > 0;
  const needsStaff = input.askStaff || staffMentioned;
  const now = new Date();
  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.loungePost.create({
      data: {
        authorUserId: viewer.userId,
        organizationId: params.organizationId,
        kind: input.kind,
        topic: input.topic,
        title: input.title,
        body: input.body,
        visibility: input.askPrivately ? 'STAFF_ONLY' : 'COMMUNITY',
        staffStatus: needsStaff ? 'OPEN' : null,
        staffRequestedAt: needsStaff ? now : null,
      },
      select: { id: true, title: true },
    });
    if (mentioned.size > 0) {
      await tx.loungeMention.createMany({
        data: [...mentioned].map((mentionedUserId) => ({
          postId: created.id,
          mentionedUserId,
          mentionedByUserId: viewer.userId,
        })),
      });
    }
    return created;
  });

  const name = await actorName(viewer, params.organizationId);
  const excerpt = excerptOf(input.body);
  const notifications: LoungeNotification[] = [];
  if (input.askStaff) {
    notifications.push({
      kind: 'staff-request',
      postId: post.id,
      postTitle: post.title,
      actorName: name,
      excerpt,
      isPrivate: input.askPrivately,
    });
  }
  for (const toUserId of mentioned) {
    notifications.push({
      kind: 'mention',
      toUserId,
      postId: post.id,
      postTitle: post.title,
      actorName: name,
      actorIsStaff: viewer.isStaff,
      excerpt,
    });
  }
  return { postId: post.id, notifications: dedupeNotifications(notifications) };
}

export async function createLoungeReply(params: {
  viewer: LoungeViewer;
  organizationId: string | null;
  postId: string;
  input: LoungeReplyInput;
}): Promise<{ replyId: string; notifications: LoungeNotification[] }> {
  const { viewer, input, postId } = params;
  const post = await findVisiblePost(viewer, postId);
  if (!post || post.hiddenAt) throw new LoungeNotFoundError();

  const mentioned = await allowedMentionIds(viewer, postId, mentionedUserIds(input.body));
  const staffIds = mentioned.size
    ? new Set(
        (
          await prisma.user.findMany({
            where: { id: { in: [...mentioned] }, isAdmin: true },
            select: { id: true },
          })
        ).map((user) => user.id)
      )
    : new Set<string>();
  const now = new Date();

  const reply = await prisma.$transaction(async (tx) => {
    const created = await tx.loungeReply.create({
      data: {
        postId,
        authorUserId: viewer.userId,
        organizationId: params.organizationId,
        body: input.body,
        isStaff: viewer.isStaff,
        videoUrl: viewer.isStaff ? input.videoUrl : null,
      },
      select: { id: true },
    });
    if (viewer.isStaff && post.staffStatus === 'OPEN') {
      await tx.loungePost.update({
        where: { id: postId },
        data: { staffStatus: 'ANSWERED', staffAnsweredAt: now },
      });
    } else if (!viewer.isStaff && staffIds.size > 0 && post.staffStatus !== 'OPEN') {
      await tx.loungePost.update({
        where: { id: postId },
        data: { staffStatus: 'OPEN', staffRequestedAt: now },
      });
    }
    if (mentioned.size > 0) {
      await tx.loungeMention.createMany({
        data: [...mentioned].map((mentionedUserId) => ({
          postId,
          replyId: created.id,
          mentionedUserId,
          mentionedByUserId: viewer.userId,
        })),
      });
    }
    return created;
  });

  const name = await actorName(viewer, params.organizationId);
  const excerpt = excerptOf(input.body);
  const notifications: LoungeNotification[] = [];
  if (post.authorUserId !== viewer.userId) {
    notifications.push({
      kind: 'reply',
      toUserId: post.authorUserId,
      postId,
      postTitle: post.title,
      actorName: name,
      actorIsStaff: viewer.isStaff,
      excerpt,
    });
  }
  for (const toUserId of mentioned) {
    notifications.push({
      kind: 'mention',
      toUserId,
      postId,
      postTitle: post.title,
      actorName: name,
      actorIsStaff: viewer.isStaff,
      excerpt,
    });
  }
  return { replyId: reply.id, notifications: dedupeNotifications(notifications) };
}

/** Toggle a "helpful" vote. Voting on your own post or reply does nothing. */
export async function toggleLoungeVote(
  viewer: LoungeViewer,
  target: { postId: string } | { replyId: string }
): Promise<{ voted: boolean }> {
  let postId: string;
  if ('replyId' in target) {
    const reply = await prisma.loungeReply.findFirst({
      where: { id: target.replyId, ...liveReply },
      select: { postId: true, authorUserId: true },
    });
    if (!reply) throw new LoungeNotFoundError();
    if (reply.authorUserId === viewer.userId) return { voted: false };
    postId = reply.postId;
  } else {
    postId = target.postId;
  }
  const post = await findVisiblePost(viewer, postId);
  if (!post || post.hiddenAt) throw new LoungeNotFoundError();
  if (!('replyId' in target) && post.authorUserId === viewer.userId) return { voted: false };

  const where =
    'replyId' in target
      ? { userId_replyId: { userId: viewer.userId, replyId: target.replyId } }
      : { userId_postId: { userId: viewer.userId, postId } };
  const existing = await prisma.loungeVote.findUnique({ where, select: { id: true } });
  if (existing) {
    await prisma.loungeVote.deleteMany({ where: { id: existing.id } });
    return { voted: false };
  }
  try {
    await prisma.loungeVote.create({
      data:
        'replyId' in target
          ? { userId: viewer.userId, replyId: target.replyId }
          : { userId: viewer.userId, postId },
    });
  } catch (error) {
    // A double click raced us to the unique row; the vote is there either way.
    if ((error as { code?: string }).code !== 'P2002') throw error;
  }
  return { voted: true };
}

export async function deleteOwnLoungePost(viewer: LoungeViewer, postId: string): Promise<boolean> {
  const result = await prisma.loungePost.updateMany({
    where: { id: postId, authorUserId: viewer.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

export async function deleteOwnLoungeReply(viewer: LoungeViewer, replyId: string): Promise<boolean> {
  const result = await prisma.loungeReply.updateMany({
    where: { id: replyId, authorUserId: viewer.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

export async function reportLoungeContent(
  viewer: LoungeViewer,
  target: { postId: string; replyId?: string | null; reason?: string | null }
): Promise<void> {
  const post = await findVisiblePost(viewer, target.postId);
  if (!post) throw new LoungeNotFoundError();
  if (target.replyId) {
    const reply = await prisma.loungeReply.findFirst({
      where: { id: target.replyId, postId: target.postId, deletedAt: null },
      select: { id: true },
    });
    if (!reply) throw new LoungeNotFoundError();
  }
  const replyId = target.replyId ?? null;
  const existing = await prisma.loungeReport.findFirst({
    where: { reporterUserId: viewer.userId, postId: target.postId, replyId, resolvedAt: null },
    select: { id: true },
  });
  if (existing) return;
  const reason = (target.reason ?? '').trim().slice(0, 500) || 'No reason given';
  await prisma.loungeReport.create({
    data: { reporterUserId: viewer.userId, postId: target.postId, replyId, reason },
  });
}

export type LoungeInboxItem = {
  id: string;
  title: string;
  excerpt: string;
  author: LoungeByline;
  isPrivate: boolean;
  requestedAt: string;
  replyCount: number;
};

export type LoungeReportItem = {
  id: string;
  createdAt: string;
  reason: string;
  postId: string;
  postTitle: string;
  replyId: string | null;
  excerpt: string;
  reporter: LoungeByline;
};

export async function listLoungeStaffInbox(): Promise<{
  waiting: LoungeInboxItem[];
  reports: LoungeReportItem[];
}> {
  const [waiting, reports] = await Promise.all([
    prisma.loungePost.findMany({
      where: { staffStatus: 'OPEN', deletedAt: null, hiddenAt: null },
      orderBy: { staffRequestedAt: 'asc' },
      take: 100,
      select: {
        id: true,
        title: true,
        body: true,
        visibility: true,
        staffRequestedAt: true,
        createdAt: true,
        author: { select: authorSelect },
        organization: { select: { name: true } },
        _count: { select: { replies: { where: liveReply } } },
      },
    }),
    prisma.loungeReport.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        reason: true,
        postId: true,
        replyId: true,
        post: { select: { title: true, body: true } },
        reply: { select: { body: true } },
        reporter: { select: authorSelect },
      },
    }),
  ]);
  return {
    waiting: waiting.map((post) => ({
      id: post.id,
      title: post.title,
      excerpt: excerptOf(post.body, 600),
      author: bylineFor(post.author, post.organization?.name, post.author.isAdmin),
      isPrivate: post.visibility === 'STAFF_ONLY',
      requestedAt: (post.staffRequestedAt ?? post.createdAt).toISOString(),
      replyCount: post._count.replies,
    })),
    reports: reports.map((report) => ({
      id: report.id,
      createdAt: report.createdAt.toISOString(),
      reason: report.reason,
      postId: report.postId,
      postTitle: report.post.title,
      replyId: report.replyId,
      excerpt: excerptOf(report.reply?.body ?? report.post.body, 400),
      reporter: bylineFor(report.reporter, null, report.reporter.isAdmin),
    })),
  };
}

export async function closeLoungeStaffRequest(postId: string): Promise<void> {
  await prisma.loungePost.updateMany({
    where: { id: postId, staffStatus: 'OPEN' },
    data: { staffStatus: 'CLOSED' },
  });
}

export async function hideLoungeContent(
  staffUserId: string,
  target: { postId: string } | { replyId: string }
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if ('replyId' in target) {
      await tx.loungeReply.updateMany({
        where: { id: target.replyId, hiddenAt: null },
        data: { hiddenAt: now, hiddenByUserId: staffUserId },
      });
      await tx.loungeReport.updateMany({
        where: { replyId: target.replyId, resolvedAt: null },
        data: { resolvedAt: now, resolvedByUserId: staffUserId, resolution: 'hidden' },
      });
    } else {
      await tx.loungePost.updateMany({
        where: { id: target.postId, hiddenAt: null },
        data: { hiddenAt: now, hiddenByUserId: staffUserId },
      });
      await tx.loungeReport.updateMany({
        where: { postId: target.postId, resolvedAt: null },
        data: { resolvedAt: now, resolvedByUserId: staffUserId, resolution: 'hidden' },
      });
    }
  });
}

export async function dismissLoungeReport(staffUserId: string, reportId: string): Promise<void> {
  await prisma.loungeReport.updateMany({
    where: { id: reportId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedByUserId: staffUserId, resolution: 'dismissed' },
  });
}

export async function getLoungeProfile(userId: string) {
  return prisma.loungeProfile.findUnique({
    where: { userId },
    select: { displayNameStyle: true, guidelinesAcceptedAt: true, emailNotifications: true },
  });
}

export async function acceptLoungeGuidelines(
  userId: string,
  style: LoungeDisplayNameStyleKey
): Promise<void> {
  const now = new Date();
  await prisma.loungeProfile.upsert({
    where: { userId },
    create: { userId, displayNameStyle: style, guidelinesAcceptedAt: now },
    update: { displayNameStyle: style, guidelinesAcceptedAt: now },
  });
}

export type LoungeMentionCandidate = { userId: string; label: string; detail: string | null };

/** The Yawp team first, then teachers already in this thread. Never the viewer. */
export async function listMentionCandidates(
  viewer: LoungeViewer,
  postId?: string | null
): Promise<LoungeMentionCandidate[]> {
  const staff = await prisma.user.findMany({
    where: { isAdmin: true, id: { not: viewer.userId } },
    orderBy: { name: 'asc' },
    take: MAX_STAFF_CANDIDATES,
    select: authorSelect,
  });
  const candidates: LoungeMentionCandidate[] = staff.map((user) => {
    const byline = bylineFor(user, null, true);
    return { userId: user.id, label: byline.name, detail: byline.detail };
  });
  if (!postId) return candidates;

  const post = await prisma.loungePost.findUnique({
    where: { id: postId },
    select: {
      author: { select: authorSelect },
      organization: { select: { name: true } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { author: { select: authorSelect }, organization: { select: { name: true } } },
      },
    },
  });
  if (!post) return candidates;
  const seen = new Set([viewer.userId, ...candidates.map((c) => c.userId)]);
  for (const entry of [post, ...post.replies]) {
    if (seen.has(entry.author.id)) continue;
    seen.add(entry.author.id);
    const byline = bylineFor(entry.author, entry.organization?.name, false);
    candidates.push({ userId: entry.author.id, label: byline.name, detail: byline.detail });
  }
  return candidates;
}

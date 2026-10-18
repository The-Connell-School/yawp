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
import { LOUNGE_TEAM_ACCOUNT_NAME, loungeByline, type LoungeDisplayNameStyleKey } from './display-name';
import { LOUNGE_TEAM_MENTION_ID, mentionedUserIds, mentionsTeam, plainTextWithMentions } from './mentions';
import { sortByTop } from './ranking';
import { assignmentShareSnapshot } from './shares';
import { kindAttachesLesson, loungeKindLabel, loungeTopicLabel, type LoungePostKindKey } from './topics';
import type { LoungePostInput, LoungeReplyInput } from './validation';
import { baseVideoContentType, type LoungeVideo } from './video';
import { hasPlaceholderText, type LoungeSchedule } from './launch';
import { avatarToneFor, firstNameOf, initialsFor, previewFor } from './avatar';
import { kindAllowsImages, stripImageMetadata, type LoungeImageType } from './images';

export type CreateLoungePostInput = LoungePostInput & {
  /**
   * One of the author's own assignments to share, frozen at post time. Only
   * a shared assignment carries one; on any other kind it is ignored.
   */
  attachAssignmentId?: string | null;
  /** Yawp team only; ignored for teachers. */
  video?: LoungeVideo | null;
  /** Yawp team only; ignored for teachers. */
  pin?: boolean;
  /** Yawp team only; ignored for teachers. Draft, or a time to go live. */
  schedule?: LoungeSchedule | null;
  /**
   * Screenshots or photos (General question and Win only; ignored on a shared
   * assignment). The caller checks the flag, the count, and the real format;
   * metadata is stripped here, so nothing is ever stored with a location.
   */
  images?: Array<{ contentType: LoungeImageType; bytes: Uint8Array; altText: string }> | null;
};

export type CreateLoungeReplyInput = LoungeReplyInput & {
  /** Yawp team only; ignored for teachers. */
  video?: LoungeVideo | null;
};

export class LoungeShareError extends Error {}

/** A draft still has Brian's "[fill this in]" notes in it. */
export class LoungePlaceholderError extends Error {
  constructor() {
    super('Fill in the [bracketed] notes before this goes live.');
  }
}

export type LoungeViewer = { userId: string; isStaff: boolean };
export type LoungeSort = 'new' | 'top' | 'unanswered';
export type LoungeByline = { name: string; detail: string | null };

/** Initials in a circle: the YAWP! team in ink, everyone else in a stable tone. */
export type LoungeAvatar = { initials: string; tone: string; isStaff: boolean };

const LOUNGE_STAFF_TONE = '#2A2824';

function isTeamAccount(name: string | null | undefined): boolean {
  return (name ?? '').trim() === LOUNGE_TEAM_ACCOUNT_NAME;
}

/** "Brian", or "YAWP! team" for the shared team account. */
function staffFirstName(name: string | null | undefined): string | null {
  return isTeamAccount(name) ? LOUNGE_TEAM_ACCOUNT_NAME : firstNameOf(name);
}

function avatarOf(author: { id: string; name: string | null; isAdmin: boolean }): LoungeAvatar {
  return {
    initials: isTeamAccount(author.name) ? 'Y!' : initialsFor(author.name),
    tone: author.isAdmin ? LOUNGE_STAFF_TONE : avatarToneFor(author.id),
    isStaff: author.isAdmin,
  };
}

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
    }
  | {
      kind: 'contact';
      messageId: string;
      actorName: string;
      excerpt: string;
    };

const PAGE_SIZE = 30;
const TOP_WINDOW_DAYS = 30;
const TOP_CANDIDATES = 200;

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

/**
 * A post is live once it is not a draft and its createdAt has arrived. For
 * posts, createdAt is when the post went (or goes) live: a scheduled post is
 * stored with createdAt at its scheduled time, and publishing a draft sets it
 * to the moment it is published, so every list sorts and labels by it.
 */
function liveWhere(now: Date): Prisma.LoungePostWhereInput {
  return { draft: false, createdAt: { lte: now } };
}

function feedWhere(viewer: LoungeViewer, topic?: string | null, now: Date = new Date()): Prisma.LoungePostWhereInput {
  return {
    ...liveWhere(now),
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
    body: true,
    replies: {
      where: { ...liveReply, isStaff: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, videoKey: true, body: true, author: { select: { name: true } } },
      take: 5,
    },
    votes: { where: { userId: viewer.userId }, select: { id: true }, take: 1 },
    _count: { select: { replies: { where: liveReply }, votes: true } },
    videoKey: true,
    pinnedAt: true,
    editedAt: true,
    draft: true,
    attachment: {
      select: {
        id: true,
        title: true,
        assignmentTypeTitle: true,
        _count: { select: { uses: true } },
      },
    },
  } satisfies Prisma.LoungePostSelect;
}

type SummaryRow = Prisma.LoungePostGetPayload<{ select: ReturnType<typeof summarySelect> }>;

export type LoungePostSummary = {
  id: string;
  kind: LoungePostKindKey;
  /** Null when the post has no topic. */
  topic: string | null;
  topicLabel: string | null;
  title: string;
  createdAt: string;
  author: LoungeByline;
  replyCount: number;
  helpfulCount: number;
  viewerVoted: boolean;
  staffAnswered: boolean;
  staffAnsweredOnVideo: boolean;
  hasVideo: boolean;
  isPinned: boolean;
  isPrivate: boolean;
  isOwn: boolean;
  isEdited: boolean;
  /** Draft or scheduled for later; only the YAWP! team ever sees these. */
  isUnpublished: boolean;
  isDraft: boolean;
  attachment: { id: string; title: string; typeTitle: string; useCount: number } | null;
  avatar: LoungeAvatar;
  /** One line for the feed: the YAWP! team's first answer, else the post body. */
  preview: string | null;
  /** First name of whoever on the YAWP! team answered first. */
  answeredBy: string | null;
};

function toSummary(row: SummaryRow, viewer: LoungeViewer): LoungePostSummary {
  return {
    id: row.id,
    kind: row.kind,
    topic: row.topic,
    topicLabel: row.topic ? loungeTopicLabel(row.topic) : null,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    author: bylineFor(row.author, row.organization?.name, row.author.isAdmin),
    replyCount: row._count.replies,
    helpfulCount: row._count.votes,
    viewerVoted: row.votes.length > 0,
    staffAnswered: row.replies.length > 0,
    staffAnsweredOnVideo: row.replies.some((reply) => reply.videoKey !== null),
    hasVideo: row.videoKey !== null,
    isPinned: row.pinnedAt !== null,
    isPrivate: row.visibility === 'STAFF_ONLY',
    isOwn: row.authorUserId === viewer.userId,
    // Changes made before it went live are not edits anyone needs to see.
    isEdited: row.editedAt !== null && row.editedAt > row.createdAt,
    isUnpublished: row.draft || row.createdAt.getTime() > Date.now(),
    isDraft: row.draft,
    avatar: avatarOf(row.author),
    preview: previewFor({ body: row.body, staffReplyBody: row.replies[0]?.body ?? null }),
    answeredBy: row.replies[0] ? staffFirstName(row.replies[0].author.name) : null,
    attachment: row.attachment
      ? {
          id: row.attachment.id,
          title: row.attachment.title,
          typeTitle: row.attachment.assignmentTypeTitle,
          useCount: row.attachment._count.uses,
        }
      : null,
  };
}

const videoSelect = {
  videoKey: true,
  videoContentType: true,
  videoDurationSeconds: true,
  videoTitle: true,
} as const;

function videoFrom(row: {
  videoKey: string | null;
  videoContentType: string | null;
  videoDurationSeconds: number | null;
  videoTitle: string | null;
}): LoungeVideo | null {
  const contentType = baseVideoContentType(row.videoContentType);
  if (!row.videoKey || !contentType) return null;
  return {
    key: row.videoKey,
    contentType,
    durationSeconds: row.videoDurationSeconds,
    title: row.videoTitle,
  };
}

function videoData(video: LoungeVideo | null | undefined) {
  return video
    ? {
        videoKey: video.key,
        videoContentType: video.contentType,
        videoDurationSeconds: video.durationSeconds,
        videoTitle: video.title,
      }
    : {};
}

export async function listLoungePosts(
  viewer: LoungeViewer,
  options: { sort: LoungeSort; topic?: string | null; before?: string | null; now?: Date }
): Promise<{ posts: LoungePostSummary[]; nextCursor: string | null }> {
  const now = options.now ?? new Date();
  const select = summarySelect(viewer);
  const base = feedWhere(viewer, options.topic, now);

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
  video: LoungeVideo | null;
  helpfulCount: number;
  viewerVoted: boolean;
  isOwn: boolean;
  isHidden: boolean;
  isEdited: boolean;
  avatar: LoungeAvatar;
};

export type LoungeShareDetail = {
  id: string;
  kind: string;
  title: string;
  typeTitle: string;
  assignmentTypeId: string;
  prompt: string;
  useCount: number;
  viewerUsed: boolean;
};

/** The post either side of one in the Latest feed, for reading straight through. */
export type LoungeAdjacentPost = {
  id: string;
  title: string;
  kindLabel: string;
  authorName: string;
  excerpt: string;
};

const adjacentSelect = {
  id: true,
  title: true,
  kind: true,
  body: true,
  organization: { select: { name: true } },
  author: { select: authorSelect },
} satisfies Prisma.LoungePostSelect;

function toAdjacent(row: Prisma.LoungePostGetPayload<{ select: typeof adjacentSelect }> | null): LoungeAdjacentPost | null {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    kindLabel: loungeKindLabel(row.kind),
    authorName: bylineFor(row.author, row.organization?.name, row.author.isAdmin).name,
    excerpt: excerptOf(row.body, 140),
  };
}

/**
 * Next is the next older post and previous the next newer one, in the
 * Latest feed's order (createdAt, then id), among the posts the viewer sees
 * in the feed. Pinned posts are ordinary posts here.
 */
export async function getAdjacentLoungePosts(
  viewer: LoungeViewer,
  post: { id: string; createdAt: Date | string },
  now: Date = new Date()
): Promise<{ previous: LoungeAdjacentPost | null; next: LoungeAdjacentPost | null }> {
  const createdAt = new Date(post.createdAt);
  const base = feedWhere(viewer, null, now);
  const [older, newer] = await Promise.all([
    prisma.loungePost.findFirst({
      where: {
        AND: [
          base,
          { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: post.id } }] },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: adjacentSelect,
    }),
    prisma.loungePost.findFirst({
      where: {
        AND: [
          base,
          { OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: post.id } }] },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: adjacentSelect,
    }),
  ]);
  return { previous: toAdjacent(newer), next: toAdjacent(older) };
}

export type LoungeThread = {
  post: Omit<LoungePostSummary, 'attachment'> & {
    body: string;
    staffStatus: 'OPEN' | 'ANSWERED' | 'CLOSED' | null;
    isHidden: boolean;
    video: LoungeVideo | null;
    attachment: LoungeShareDetail | null;
    images: Array<{ id: string; altText: string }>;
  };
  staffReplies: LoungeReplyView[];
  replies: LoungeReplyView[];
};

async function findVisiblePost(viewer: LoungeViewer, postId: string) {
  const post = await prisma.loungePost.findFirst({
    where: { id: postId, deletedAt: null },
    select: {
      id: true,
      title: true,
      authorUserId: true,
      visibility: true,
      hiddenAt: true,
      staffStatus: true,
      draft: true,
      createdAt: true,
    },
  });
  if (!post) return null;
  if (post.hiddenAt && !viewer.isStaff) return null;
  const live = !post.draft && post.createdAt.getTime() <= Date.now();
  if (!live && !viewer.isStaff) return null;
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
      ...videoSelect,
      body: true,
      staffStatus: true,
      hiddenAt: true,
      images: { orderBy: { position: 'asc' }, select: { id: true, altText: true } },
      attachment: {
        select: {
          id: true,
          kind: true,
          title: true,
          assignmentTypeTitle: true,
          assignmentTypeId: true,
          prompt: true,
          _count: { select: { uses: true } },
          uses: { where: { userId: viewer.userId }, select: { id: true }, take: 1 },
        },
      },
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
      ...videoSelect,
      hiddenAt: true,
      editedAt: true,
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
    video: reply.isStaff ? videoFrom(reply) : null,
    helpfulCount: reply._count.votes,
    viewerVoted: reply.votes.length > 0,
    isOwn: reply.authorUserId === viewer.userId,
    isHidden: reply.hiddenAt !== null,
    isEdited: reply.editedAt !== null,
    avatar: avatarOf(reply.author),
  }));
  return {
    post: {
      ...toSummary(row, viewer),
      body: row.body,
      staffStatus: row.staffStatus,
      isHidden: row.hiddenAt !== null,
      video: videoFrom(row),
      attachment: row.attachment
        ? {
            id: row.attachment.id,
            kind: row.attachment.kind,
            title: row.attachment.title,
            typeTitle: row.attachment.assignmentTypeTitle,
            assignmentTypeId: row.attachment.assignmentTypeId,
            prompt: row.attachment.prompt,
            useCount: row.attachment._count.uses,
            viewerUsed: row.attachment.uses.length > 0,
          }
        : null,
      images: row.images,
    },
    staffReplies: views.filter((reply) => reply.isStaff),
    replies: views.filter((reply) => !reply.isStaff),
  };
}

/**
 * One image from a post, for the image route: only if the viewer can read the
 * post (the same rule as the thread, so the YAWP! team still sees images on
 * a post it hid).
 */
export async function getVisibleLoungeImage(
  viewer: LoungeViewer,
  imageId: string
): Promise<{ contentType: string; byteSize: number; blob: Uint8Array } | null> {
  const image = await prisma.loungePostImage.findUnique({
    where: { id: imageId },
    select: { postId: true, contentType: true, byteSize: true, blob: true },
  });
  if (!image || !(await findVisiblePost(viewer, image.postId))) return null;
  return { contentType: image.contentType, byteSize: image.byteSize, blob: image.blob };
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
    if (!('toUserId' in notification)) return true;
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
  /** The author's school membership, to check an attached assignment is theirs. */
  membershipId: string | null;
  input: CreateLoungePostInput;
}): Promise<{ postId: string; notifications: LoungeNotification[] }> {
  const { viewer, input } = params;
  let snapshot: ReturnType<typeof assignmentShareSnapshot> | null = null;
  if (input.attachAssignmentId && kindAttachesLesson(input.kind)) {
    const source = params.membershipId
      ? await prisma.assignment.findFirst({
          where: { id: input.attachAssignmentId, ...ownAssignmentWhere(params.membershipId) },
          select: shareSourceSelect,
        })
      : null;
    if (!source) throw new LoungeShareError('That assignment is not one of yours.');
    snapshot = assignmentShareSnapshot(source);
  }
  const mentioned = await allowedMentionIds(viewer, null, mentionedUserIds(input.body));
  const staffMentioned = mentioned.size > 0;
  const teamMentioned = mentionsTeam(input.body);
  const needsStaff = input.askStaff || staffMentioned || teamMentioned;
  const now = new Date();
  const schedule = viewer.isStaff ? input.schedule ?? null : null;
  const goesLiveNow = !schedule || (!schedule.draft && !schedule.publishAt);
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
        ...(viewer.isStaff ? videoData(input.video) : {}),
        ...(viewer.isStaff && input.pin ? { pinnedAt: now, pinnedByUserId: viewer.userId } : {}),
        ...(schedule?.draft ? { draft: true } : {}),
        ...(schedule?.publishAt ? { publishAt: schedule.publishAt, createdAt: schedule.publishAt } : {}),
        ...(snapshot
          ? {
              attachment: {
                create: {
                  kind: snapshot.kind,
                  sourceId: snapshot.sourceId,
                  assignmentTypeId: snapshot.assignmentTypeId,
                  assignmentTypeTitle: snapshot.assignmentTypeTitle,
                  title: snapshot.title,
                  prompt: snapshot.prompt,
                  settings: snapshot.settings,
                },
              },
            }
          : {}),
      },
      select: { id: true, title: true },
    });
    const images = kindAllowsImages(input.kind) ? input.images ?? [] : [];
    if (images.length > 0) {
      await tx.loungePostImage.createMany({
        data: images.map((image, position) => {
          const bytes = stripImageMetadata(image.bytes, image.contentType);
          return {
            postId: created.id,
            position,
            altText: image.altText,
            contentType: image.contentType,
            byteSize: bytes.byteLength,
            blob: Buffer.from(bytes),
          };
        }),
      });
    }
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

  // Nobody hears about a draft or a scheduled post before it is live.
  if (!goesLiveNow) return { postId: post.id, notifications: [] };
  const name = await actorName(viewer, params.organizationId);
  const excerpt = excerptOf(input.body);
  const notifications: LoungeNotification[] = [];
  if (input.askStaff || teamMentioned) {
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
  input: CreateLoungeReplyInput;
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
  // "@YAWP! team" from a teacher asks the team, like checking "Ask the YAWP! team".
  const teamMentioned = !viewer.isStaff && mentionsTeam(input.body);
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
        ...(viewer.isStaff ? videoData(input.video) : {}),
      },
      select: { id: true },
    });
    if (viewer.isStaff && post.staffStatus === 'OPEN') {
      await tx.loungePost.update({
        where: { id: postId },
        data: { staffStatus: 'ANSWERED', staffAnsweredAt: now },
      });
    } else if (!viewer.isStaff && (staffIds.size > 0 || teamMentioned) && post.staffStatus !== 'OPEN') {
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
  if (teamMentioned) {
    notifications.push({
      kind: 'staff-request',
      postId,
      postTitle: post.title,
      actorName: name,
      excerpt,
      isPrivate: post.visibility === 'STAFF_ONLY',
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

export type LoungeContactItem = {
  id: string;
  createdAt: string;
  message: string;
  pageUrl: string | null;
  from: LoungeByline;
  email: string | null;
};

export async function listLoungeStaffInbox(): Promise<{
  waiting: LoungeInboxItem[];
  reports: LoungeReportItem[];
  messages: LoungeContactItem[];
}> {
  const [waiting, reports, messages] = await Promise.all([
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
    prisma.loungeContactMessage.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        message: true,
        pageUrl: true,
        organizationId: true,
        user: { select: { ...authorSelect, email: true } },
      },
    }),
  ]);
  const schoolIds = [...new Set(messages.map((m) => m.organizationId).filter((id): id is string => !!id))];
  const schools = schoolIds.length
    ? await prisma.organization.findMany({ where: { id: { in: schoolIds } }, select: { id: true, name: true } })
    : [];
  const schoolName = new Map(schools.map((school) => [school.id, school.name]));
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
    messages: messages.map((message) => ({
      id: message.id,
      createdAt: message.createdAt.toISOString(),
      message: message.message,
      pageUrl: message.pageUrl,
      from: bylineFor(
        message.user,
        message.organizationId ? schoolName.get(message.organizationId) : null,
        message.user.isAdmin
      ),
      email: message.user.email,
    })),
  };
}

export async function createLoungeContactMessage(
  viewer: LoungeViewer,
  input: { organizationId: string | null; message: string; pageUrl: string | null }
): Promise<{ messageId: string; notification: LoungeNotification }> {
  const row = await prisma.loungeContactMessage.create({
    data: {
      userId: viewer.userId,
      organizationId: input.organizationId,
      message: input.message,
      pageUrl: input.pageUrl,
    },
    select: { id: true },
  });
  return {
    messageId: row.id,
    notification: {
      kind: 'contact',
      messageId: row.id,
      actorName: await actorName(viewer, input.organizationId),
      excerpt: excerptOf(input.message, 1200),
    },
  };
}

export async function resolveLoungeContactMessage(staffUserId: string, messageId: string): Promise<void> {
  await prisma.loungeContactMessage.updateMany({
    where: { id: messageId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedByUserId: staffUserId },
  });
}

export type LoungeUnpublishedItem = {
  id: string;
  title: string;
  draft: boolean;
  publishAt: string | null;
  hasPlaceholders: boolean;
  author: LoungeByline;
};

/** Drafts and scheduled posts, soonest first, for the YAWP! team. */
export async function listLoungeUnpublished(now: Date = new Date()): Promise<LoungeUnpublishedItem[]> {
  const rows = await prisma.loungePost.findMany({
    where: { deletedAt: null, OR: [{ draft: true }, { createdAt: { gt: now } }] },
    orderBy: [{ draft: 'asc' }, { createdAt: 'asc' }],
    take: 100,
    select: {
      id: true,
      title: true,
      body: true,
      draft: true,
      createdAt: true,
      author: { select: authorSelect },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    draft: row.draft,
    publishAt: row.draft ? null : row.createdAt.toISOString(),
    hasPlaceholders: hasPlaceholderText(row.body),
    author: bylineFor(row.author, null, row.author.isAdmin),
  }));
}

async function assertReadyToGoLive(postId: string) {
  const post = await prisma.loungePost.findFirst({ where: { id: postId, deletedAt: null }, select: { body: true } });
  if (!post) throw new LoungeNotFoundError();
  if (hasPlaceholderText(post.body)) throw new LoungePlaceholderError();
}

/** Put a draft or scheduled post live right now. */
export async function publishLoungePostNow(postId: string): Promise<void> {
  await assertReadyToGoLive(postId);
  const now = new Date();
  await prisma.loungePost.updateMany({
    where: { id: postId, deletedAt: null },
    data: { draft: false, createdAt: now, publishAt: now },
  });
}

/** Schedule a draft (or move a scheduled post); it goes live at publishAt. */
export async function scheduleLoungePost(postId: string, publishAt: Date): Promise<void> {
  await assertReadyToGoLive(postId);
  await prisma.loungePost.updateMany({
    where: { id: postId, deletedAt: null },
    data: { draft: false, createdAt: publishAt, publishAt },
  });
}

export async function editOwnLoungePost(
  viewer: LoungeViewer,
  postId: string,
  input: { title: string; body: string }
): Promise<boolean> {
  const result = await prisma.loungePost.updateMany({
    where: { id: postId, authorUserId: viewer.userId, deletedAt: null },
    data: { title: input.title, body: input.body, editedAt: new Date() },
  });
  return result.count > 0;
}

export async function editOwnLoungeReply(
  viewer: LoungeViewer,
  replyId: string,
  input: { body: string }
): Promise<boolean> {
  const result = await prisma.loungeReply.updateMany({
    where: { id: replyId, authorUserId: viewer.userId, deletedAt: null },
    data: { body: input.body, editedAt: new Date() },
  });
  return result.count > 0;
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
    select: {
      displayNameStyle: true,
      guidelinesAcceptedAt: true,
      emailNotifications: true,
      shareConsentAt: true,
    },
  });
}

/** The first-visit welcome box: house rules (required) and sharing consent (optional). */
export async function acceptLoungeHouseRules(
  userId: string,
  { shareConsent }: { shareConsent: boolean }
): Promise<void> {
  const now = new Date();
  const consent = { shareConsentAt: shareConsent ? now : null };
  await prisma.loungeProfile.upsert({
    where: { userId },
    create: { userId, guidelinesAcceptedAt: now, ...consent },
    update: { guidelinesAcceptedAt: now, ...consent },
  });
}

export async function updateLoungeSettings(
  userId: string,
  settings: { shareConsent?: boolean; emailNotifications?: boolean }
): Promise<void> {
  const current = await prisma.loungeProfile.findUnique({
    where: { userId },
    select: { shareConsentAt: true },
  });
  if (!current) return;
  await prisma.loungeProfile.update({
    where: { userId },
    data: {
      ...(settings.emailNotifications === undefined ? {} : { emailNotifications: settings.emailNotifications }),
      ...(settings.shareConsent === undefined
        ? {}
        : { shareConsentAt: settings.shareConsent ? current.shareConsentAt ?? new Date() : null }),
    },
  });
}

export type LoungeMentionCandidate = { userId: string; label: string; detail: string | null };

const TEAM_CANDIDATE: LoungeMentionCandidate = {
  userId: LOUNGE_TEAM_MENTION_ID,
  label: LOUNGE_TEAM_ACCOUNT_NAME,
  detail: 'Brian and the team',
};

/**
 * Who the @ picker offers: "YAWP! team" (the whole team), Brian by first
 * name, then teachers already in this thread. Other staff are reached
 * through "@YAWP! team", not by name. Never the viewer.
 */
export async function listMentionCandidates(
  viewer: LoungeViewer,
  postId?: string | null
): Promise<LoungeMentionCandidate[]> {
  const host = await getLoungeHost();
  const candidates: LoungeMentionCandidate[] = [TEAM_CANDIDATE];
  if (host && host.userId !== viewer.userId) {
    candidates.push({ userId: host.userId, label: host.firstName, detail: LOUNGE_TEAM_ACCOUNT_NAME });
  }
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
    if (seen.has(entry.author.id) || entry.author.isAdmin) continue;
    seen.add(entry.author.id);
    const byline = bylineFor(entry.author, entry.organization?.name, false);
    candidates.push({ userId: entry.author.id, label: byline.name, detail: byline.detail });
  }
  return candidates;
}

/** Assignments deployed to one of this teacher's classes. */
function ownAssignmentWhere(membershipId: string): Prisma.AssignmentWhereInput {
  return {
    classAssignments: { some: { class: { teachers: { some: { id: membershipId } } } } },
    assignmentType: { archivedAt: null },
  };
}

const shareSourceSelect = {
  id: true,
  title: true,
  prompt: true,
  submitForGrade: true,
  pointValue: true,
  tutorEnabled: true,
  gradingAssistantStrictnessLevel: true,
  assignmentType: { select: { id: true, title: true } },
} satisfies Prisma.AssignmentSelect;

export type ShareableAssignment = { id: string; title: string; typeTitle: string; createdAt: string };

/** The teacher's own recent assignments, for "Attach from Yawp". */
export async function listShareableAssignments(membershipId: string): Promise<ShareableAssignment[]> {
  const rows = await prisma.assignment.findMany({
    where: ownAssignmentWhere(membershipId),
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { ...shareSourceSelect, createdAt: true },
  });
  return rows.map((row) => {
    const snapshot = assignmentShareSnapshot(row);
    return {
      id: row.id,
      title: snapshot.title,
      typeTitle: snapshot.assignmentTypeTitle,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

async function findVisibleAttachment(viewer: LoungeViewer, attachmentId: string) {
  const attachment = await prisma.loungeAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, postId: true, assignmentTypeId: true, prompt: true },
  });
  if (!attachment) return null;
  const post = await findVisiblePost(viewer, attachment.postId);
  if (!post || post.hiddenAt) return null;
  return attachment;
}

/** A teacher clicked "Use in my class". Counts once per teacher. */
export async function recordShareUse(
  viewer: LoungeViewer,
  attachmentId: string
): Promise<{ assignmentTypeId: string }> {
  const attachment = await findVisibleAttachment(viewer, attachmentId);
  if (!attachment) throw new LoungeNotFoundError();
  await prisma.loungeAttachmentUse.upsert({
    where: { attachmentId_userId: { attachmentId, userId: viewer.userId } },
    create: { attachmentId, userId: viewer.userId },
    update: {},
  });
  return { assignmentTypeId: attachment.assignmentTypeId };
}

/**
 * The prompt to pre-fill when a teacher arrives on an assignment type page
 * from a share. Null unless they can see the share and it is for that type.
 */
export async function getSharePromptForViewer(
  viewer: LoungeViewer,
  attachmentId: string,
  assignmentTypeId: string
): Promise<string | null> {
  const attachment = await findVisibleAttachment(viewer, attachmentId);
  if (!attachment || attachment.assignmentTypeId !== assignmentTypeId) return null;
  return attachment.prompt;
}

export type LoungePinnedPost = {
  id: string;
  kind: LoungePostKindKey;
  title: string;
  excerpt: string;
  author: LoungeByline;
  avatar: LoungeAvatar;
  authorFirstName: string;
  authorIsStaff: boolean;
  replyCount: number;
  videoDurationSeconds: number | null;
  hasVideo: boolean;
};

const MAX_PINNED = 4;

/** Pinned posts the viewer can see, oldest pin first (welcome, house rules, then the weekly prompt). */
export async function listPinnedLoungePosts(
  viewer: LoungeViewer,
  now: Date = new Date()
): Promise<LoungePinnedPost[]> {
  const rows = await prisma.loungePost.findMany({
    where: { ...feedWhere(viewer, null, now), pinnedAt: { not: null } },
    orderBy: { pinnedAt: 'asc' },
    take: MAX_PINNED,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      videoKey: true,
      videoDurationSeconds: true,
      author: { select: authorSelect },
      organization: { select: { name: true } },
      _count: { select: { replies: { where: liveReply } } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    excerpt: excerptOf(row.body),
    author: bylineFor(row.author, row.organization?.name, row.author.isAdmin),
    avatar: avatarOf(row.author),
    authorFirstName: staffFirstName(row.author.name) ?? 'the YAWP! team',
    authorIsStaff: row.author.isAdmin,
    replyCount: row._count.replies,
    videoDurationSeconds: row.videoDurationSeconds,
    hasVideo: row.videoKey !== null,
  }));
}

export type LoungeHost = { userId: string; name: string; firstName: string; avatar: LoungeAvatar };

/**
 * The person the Lounge is "from" (Brian): whoever on the YAWP! team wrote
 * the oldest post still pinned, which is the welcome letter. Teachers can
 * @mention the host by name; everyone else on the team through "@YAWP! team".
 */
export async function getLoungeHost(): Promise<LoungeHost | null> {
  const now = new Date();
  const post = await prisma.loungePost.findFirst({
    where: {
      ...liveWhere(now),
      deletedAt: null,
      hiddenAt: null,
      visibility: 'COMMUNITY',
      pinnedAt: { not: null },
      author: { isAdmin: true, NOT: { name: LOUNGE_TEAM_ACCOUNT_NAME } },
    },
    orderBy: { pinnedAt: 'asc' },
    select: { author: { select: { id: true, name: true, isAdmin: true } } },
  });
  if (!post) return null;
  const { author } = post;
  return {
    userId: author.id,
    name: author.name?.trim() || LOUNGE_TEAM_ACCOUNT_NAME,
    firstName: firstNameOf(author.name) ?? LOUNGE_TEAM_ACCOUNT_NAME,
    avatar: avatarOf(author),
  };
}

export type LoungeTopicCount = { topic: string; label: string; count: number };

/** Live posts the viewer can see, per topic, busiest first. */
export async function listLoungeTopicCounts(
  viewer: LoungeViewer,
  now: Date = new Date()
): Promise<LoungeTopicCount[]> {
  const groups = await prisma.loungePost.groupBy({
    by: ['topic'],
    where: feedWhere(viewer, null, now),
    _count: { _all: true },
  });
  return groups
    .flatMap((group) =>
      group.topic ? [{ topic: group.topic, label: loungeTopicLabel(group.topic), count: group._count._all }] : []
    )
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function setLoungePostPinned(
  staffUserId: string,
  postId: string,
  pinned: boolean
): Promise<void> {
  await prisma.loungePost.updateMany({
    where: { id: postId, deletedAt: null },
    data: pinned
      ? { pinnedAt: new Date(), pinnedByUserId: staffUserId }
      : { pinnedAt: null, pinnedByUserId: null },
  });
}

/**
 * Comment shapes on a shared draft: the pure part, safe for the browser.
 *
 * The thread component renders these, and importing the type from
 * `comments.server` would put a Prisma-importing module in the client's import
 * graph. TypeScript erases a type-only import, but the build's server-only check
 * does not care whether the import was erasable.
 */

export type DraftCommentAuthor = {
  authorMembershipId: string;
  authorName: string;
  authorRole: string;
};

export type DraftCommentResponse = DraftCommentAuthor & {
  id: string;
  content: string;
  createdAt: string;
};

export type DraftComment = DraftCommentAuthor & {
  id: string;
  content: string;
  createdAt: string;
  responses: DraftCommentResponse[];
};

import {
  type DocumentCommentResponse,
  type DocumentComment,
  type User,
  type OrgMembership,
} from '@app/prisma';
import { MarginCommentCard } from './margin-comment-card';
import { MarginCommentResolvedRow } from './margin-comment-resolved-row';

export type Comment = DocumentComment & {
  membership: Omit<OrgMembership, 'createdAt' | 'updatedAt'>;
  responses: (DocumentCommentResponse & {
    membership: Omit<OrgMembership, 'createdAt' | 'updatedAt'> & {
      user: User;
    };
  })[];
};

type CommentProps = Comment & {
  readOnly?: boolean;
  layout?: 'sidebar' | 'margin';
  surface?: 'margin' | 'sheet';
  testIdPrefix?: string;
  onDelete?: (commentId: string) => void;
  onResponseAdded?: (commentId: string, response: unknown) => void;
  onArchiveChange?: (commentId: string, archivedAt: Date | null) => void;
  autoFocusReply?: boolean;
  initialResolvedExpanded?: boolean;
};

export const Comment = ({
  readOnly = false,
  layout = 'sidebar',
  surface = 'sheet',
  testIdPrefix,
  onDelete,
  onResponseAdded,
  onArchiveChange,
  autoFocusReply = false,
  initialResolvedExpanded = false,
  ...comment
}: CommentProps) => {
  const resolvedTestIdPrefix =
    testIdPrefix ??
    (layout === 'margin' ? 'margin-comment-card' : 'comments-sheet-card');
  const resolvedSurface = layout === 'margin' ? 'margin' : surface;

  if (comment.archivedAt) {
    return (
      <MarginCommentResolvedRow
        {...comment}
        readOnly={readOnly}
        surface={resolvedSurface}
        testIdPrefix={
          layout === 'margin' ? 'margin-comment-resolved' : 'comments-sheet-resolved'
        }
        initialExpanded={initialResolvedExpanded}
        onDelete={onDelete}
        onResponseAdded={onResponseAdded}
        onArchiveChange={onArchiveChange}
      />
    );
  }

  return (
    <MarginCommentCard
      {...comment}
      readOnly={readOnly}
      surface={resolvedSurface}
      testIdPrefix={resolvedTestIdPrefix}
      onDelete={onDelete}
      onResponseAdded={onResponseAdded}
      onArchiveChange={onArchiveChange}
      autoFocusReply={autoFocusReply}
    />
  );
};
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';

type CommentAuthorShape = {
  profile?: { user?: { name?: string | null; email?: string } };
  membership?: { user?: { name?: string | null; email?: string } };
};

function getCommentAuthorLabel(comment: CommentAuthorShape) {
  const user = comment.membership?.user ?? comment.profile?.user;
  return user?.name || user?.email || 'Unknown user';
}

export type GradeComment = {
  id: string;
  content: string;
  profile?: { user: { name: string | null; email: string } };
  membership?: { user: { name: string | null; email: string } };
  responses?: {
    id: string;
    content: string;
    profile?: { user: { name: string | null; email: string } };
    membership?: { user: { name: string | null; email: string } };
  }[];
};

type Props = {
  comment: GradeComment;
  isActive?: boolean;
  onClick?: () => void;
  readOnly?: boolean;
  editingCommentId?: string | null;
  editCommentContent?: string;
  onEditContentChange?: (v: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onEdit?: (comment: GradeComment) => void;
  onDelete?: (comment: GradeComment) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
};

export function GradeCommentCard({
  comment,
  isActive = false,
  onClick,
  readOnly = false,
  editingCommentId,
  editCommentContent = '',
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  onEdit,
  onDelete,
  isSaving = false,
  isDeleting = false,
  cardRef,
}: Props) {
  const isEditing = editingCommentId === comment.id;

  return (
    <div
      data-grade-comment-card={comment.id}
      ref={cardRef}
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-[box-shadow,background-color,border-color] duration-200',
        isActive
          ? 'comment-card-focused'
          : readOnly
            ? 'bg-white'
            : 'bg-muted/40 hover:border-yellow-300',
        onClick && 'cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {getCommentAuthorLabel(comment)}
          </div>
        </div>
        {!readOnly && onEdit && onDelete && !isEditing && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving || isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(comment);
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(comment);
              }}
            >
              Delete
            </Button>
          </div>
        )}
        {!readOnly && isEditing && onSaveEdit && onCancelEdit && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!editCommentContent.trim() || isSaving}
              onClick={(e) => {
                e.stopPropagation();
                onSaveEdit();
              }}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={(e) => {
                e.stopPropagation();
                onCancelEdit();
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
      {isEditing && onEditContentChange ? (
        <Textarea
          value={editCommentContent}
          onChange={(e) => onEditContentChange(e.target.value)}
          placeholder="Update your comment..."
          rows={4}
          className="mt-2 resize-none"
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <p className="mt-1 whitespace-pre-line text-sm">{comment.content}</p>
      )}
      {comment.responses?.length && !isEditing ? (
        <div className="mt-2 space-y-1 border-t pt-2">
          {comment.responses.map((r) => (
            <div key={r.id} className="whitespace-pre-line text-sm">
              <span className="font-medium">
                {getCommentAuthorLabel(r)}:
              </span>{' '}
              {r.content}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

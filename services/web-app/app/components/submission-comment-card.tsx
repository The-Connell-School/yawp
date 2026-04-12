import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';

export type SubmissionComment = {
  id: string;
  content: string;
  profile: { user: { name: string | null; email: string } };
  responses?: {
    id: string;
    content: string;
    profile: { user: { name: string | null; email: string } };
  }[];
};

type Props = {
  comment: SubmissionComment;
  isActive?: boolean;
  onClick?: () => void;
  readOnly?: boolean;
  editingCommentId?: string | null;
  editCommentContent?: string;
  onEditContentChange?: (v: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onEdit?: (comment: SubmissionComment) => void;
  onDelete?: (comment: SubmissionComment) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
};

export function SubmissionCommentCard({
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
        'group w-full rounded-lg border p-3 text-left transition-all duration-100',
        readOnly ? 'bg-white' : 'bg-muted/30 hover:border-yellow-300 hover:bg-white',
        onClick && 'cursor-pointer',
        isActive && 'border-yellow-300 bg-white shadow-sm ring-1 ring-yellow-200'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">
            {comment.profile.user.name || comment.profile.user.email}
          </div>
        </div>
        {!readOnly && onEdit && onDelete && !isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
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
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
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
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={!editCommentContent.trim() || isSaving}
              onClick={(e) => {
                e.stopPropagation();
                onSaveEdit();
              }}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
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
          placeholder="Update your comment…"
          rows={4}
          className="mt-2 resize-none text-sm"
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{comment.content}</p>
      )}
      {comment.responses?.length && !isEditing ? (
        <div className="mt-2 space-y-1.5 border-t pt-2">
          {comment.responses.map((r) => (
            <div key={r.id} className="whitespace-pre-line text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">
                {r.profile.user.name || r.profile.user.email}:
              </span>{' '}
              {r.content}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * @deprecated Use SubmissionCommentCard / SubmissionComment instead.
 * Kept as re-exports for backward compatibility during migration.
 */
export type GradeComment = SubmissionComment;
export const GradeCommentCard = SubmissionCommentCard;

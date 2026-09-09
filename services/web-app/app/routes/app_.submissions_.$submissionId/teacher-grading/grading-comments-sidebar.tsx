import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import {
  SubmissionCommentCard,
  type SubmissionComment as CardSubmissionComment,
} from '~/components/submission-comment-card';
import { findExcerptRange } from '~/utils/excerpt-position';

type SubmissionComment = CardSubmissionComment & {
  excerpt: string | null;
  occurrence?: number | null;
  createdAt: Date | string;
};

type DraftComment = {
  id: 'draft';
  excerpt: string | null;
  occurrence: number;
  createdAt: Date;
};

function isDraftComment(
  c: SubmissionComment | DraftComment
): c is DraftComment {
  return c.id === 'draft';
}

type Props = {
  submissionComments: SubmissionComment[];
  submissionId: string | null;
  sourceText: string;
  readOnly?: boolean;
  activeGradeCommentId?: string | null;
  onSelectGradeComment?: (id: string) => void;
  onDraftHighlightChange?: (highlight: { excerpt: string; occurrence: number } | null) => void;
  onCommentCreated?: (comment: SubmissionComment) => void;
  onCommentDeleted?: (commentId: string) => void;
  onCommentUpdated?: (commentId: string, content: string) => void;
  heading?: string;
};

function sortByDocumentLocation<T extends { createdAt: Date | string }>(
  items: T[],
  sourceText: string,
  getExcerpt: (item: T) => string | null | undefined,
  getOccurrence?: (item: T) => number | null | undefined
): T[] {
  return [...items].sort((a, b) => {
    const aRange = findExcerptRange(
      sourceText,
      getExcerpt(a),
      getOccurrence?.(a) ?? 1
    );
    const bRange = findExcerptRange(
      sourceText,
      getExcerpt(b),
      getOccurrence?.(b) ?? 1
    );

    if (aRange && bRange) {
      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      return aRange.end - bRange.end;
    }
    if (aRange) return -1;
    if (bRange) return 1;

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function GradingCommentsSidebar({
  submissionComments,
  submissionId,
  sourceText,
  readOnly = false,
  activeGradeCommentId = null,
  onSelectGradeComment,
  onDraftHighlightChange,
  onCommentCreated,
  onCommentDeleted,
  onCommentUpdated,
  heading = 'Grade comments',
}: Props) {
  const [draftComment, setDraftComment] = useState<DraftComment | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');
  const createFetcher = useFetcher<{ success?: boolean }>();
  const deleteFetcher = useFetcher<{ success?: boolean }>();
  const updateFetcher = useFetcher<{ success?: boolean }>();
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent;
      const { excerpt, occurrence } = ev.detail ?? {};
      if (!readOnly && typeof excerpt === 'string' && typeof occurrence === 'number') {
        setDraftComment({
          id: 'draft',
          excerpt,
          occurrence,
          createdAt: new Date(),
        });
        setDraftContent('');
        onSelectGradeComment?.('draft');
      }
    };
    window.addEventListener('grading-comment-request', handler);
    return () => window.removeEventListener('grading-comment-request', handler);
  }, [onSelectGradeComment]);

  useEffect(() => {
    if (draftComment) {
      requestAnimationFrame(() => {
        draftTextareaRef.current?.focus();
      });
    }
  }, [draftComment]);

  useEffect(() => {
    if (draftComment?.excerpt) {
      onDraftHighlightChange?.({ excerpt: draftComment.excerpt, occurrence: draftComment.occurrence });
    } else {
      onDraftHighlightChange?.(null);
    }
  }, [draftComment?.excerpt, draftComment?.occurrence, onDraftHighlightChange]);

  const submitDraftComment = () => {
    if (
      !draftContent.trim() ||
      !submissionId ||
      !draftComment?.excerpt
    )
      return;

    const form = new FormData();
    form.append('submissionId', submissionId);
    form.append('content', draftContent.trim());
    if (draftComment?.excerpt) {
      form.append('excerpt', draftComment.excerpt);
      form.append('occurrence', draftComment.occurrence.toString());
    }
    createFetcher.submit(form, {
      method: 'POST',
      action: '/api/model/submission-comment',
    });
  };

  const lastHandledCreateRef = useRef<unknown>(null);
  useEffect(() => {
    if (
      createFetcher.data?.success &&
      createFetcher.state === 'idle' &&
      createFetcher.data !== lastHandledCreateRef.current
    ) {
      lastHandledCreateRef.current = createFetcher.data;
      const created = (createFetcher.data as any).comment;
      if (created && onCommentCreated) {
        onCommentCreated(created);
      }
      setDraftComment(null);
      setDraftContent('');
    }
  }, [createFetcher.data, createFetcher.state, onCommentCreated]);

  const cancelDraft = () => {
    setDraftComment(null);
    setDraftContent('');
  };

  const deleteComment = (commentId: string) => {
    deleteFetcher.submit(null, {
      method: 'DELETE',
      action: `/api/model/submission-comment/${commentId}`,
    });
  };

  const openEditComment = (comment: CardSubmissionComment) => {
    setEditingCommentId(comment.id);
    setEditCommentContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditCommentContent('');
  };

  const submitEditComment = () => {
    if (!editingCommentId || !editCommentContent.trim()) return;
    const form = new FormData();
    form.append('content', editCommentContent.trim());
    updateFetcher.submit(form, {
      method: 'POST',
      action: `/api/model/submission-comment/${editingCommentId}`,
    });
  };

  const lastHandledDeleteRef = useRef<unknown>(null);
  useEffect(() => {
    if (
      deleteFetcher.data?.success &&
      deleteFetcher.state === 'idle' &&
      deleteFetcher.data !== lastHandledDeleteRef.current
    ) {
      lastHandledDeleteRef.current = deleteFetcher.data;
      const deletedId = (deleteFetcher.data as any).commentId;
      if (deletedId && onCommentDeleted) {
        onCommentDeleted(deletedId);
      }
    }
  }, [deleteFetcher.data, deleteFetcher.state, onCommentDeleted]);

  const lastHandledUpdateRef = useRef<unknown>(null);
  useEffect(() => {
    if (
      updateFetcher.data?.success &&
      updateFetcher.state === 'idle' &&
      updateFetcher.data !== lastHandledUpdateRef.current
    ) {
      lastHandledUpdateRef.current = updateFetcher.data;
      if (editingCommentId && onCommentUpdated) {
        onCommentUpdated(editingCommentId, editCommentContent);
      }
      setEditingCommentId(null);
      setEditCommentContent('');
    }
  }, [updateFetcher.data, updateFetcher.state, editingCommentId, editCommentContent, onCommentUpdated]);

  useEffect(() => {
    if (!activeGradeCommentId || activeGradeCommentId === 'draft') return;
    commentRefs.current[activeGradeCommentId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeGradeCommentId]);

  useEffect(() => {
    if (activeGradeCommentId === 'draft' && draftComment) {
      draftTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeGradeCommentId, draftComment]);

  const combinedItems = sortByDocumentLocation(
    draftComment ? [...submissionComments, draftComment] : [...submissionComments],
    sourceText,
    (c) => ('excerpt' in c ? c.excerpt : null),
    (c) => ('occurrence' in c ? c.occurrence : 1)
  );

  return (
    <div className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b p-2">
          <h2 className="text-sm font-semibold">{heading}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {combinedItems.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <MessageSquarePlus className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
              <p className="text-sm font-medium text-muted-foreground">No feedback yet</p>
              {!readOnly ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Select text in the essay, then click the Comment button to add your first note.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {combinedItems.map((c) => {
                if (isDraftComment(c)) {
                  return (
                  <div
                    key="draft"
                    data-grade-comment-card="draft"
                    ref={(el) => {
                      commentRefs.current['draft'] = el;
                    }}
                    onClick={() => onSelectGradeComment?.('draft')}
                    className="w-full rounded-lg border-2 border-dashed border-yellow-400 bg-yellow-50/50 p-3 dark:border-yellow-600 dark:bg-yellow-950/20"
                  >
                    <Textarea
                      ref={draftTextareaRef}
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      onFocus={() => onSelectGradeComment?.('draft')}
                      placeholder="Write your comment..."
                      rows={3}
                      className="mt-2 resize-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          submitDraftComment();
                        }}
                        disabled={
                          !draftContent.trim() || createFetcher.state !== 'idle'
                        }
                      >
                        {createFetcher.state !== 'idle' ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelDraft();
                        }}
                        disabled={createFetcher.state !== 'idle'}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                  );
                }
                return (
                  <SubmissionCommentCard
                    key={c.id}
                    comment={c}
                    readOnly={readOnly}
                    isActive={activeGradeCommentId === c.id}
                    onClick={() => onSelectGradeComment?.(c.id)}
                    editingCommentId={editingCommentId}
                    editCommentContent={editCommentContent}
                    onEditContentChange={setEditCommentContent}
                    onSaveEdit={submitEditComment}
                    onCancelEdit={cancelEdit}
                    onEdit={openEditComment}
                    onDelete={(comment) => deleteComment(comment.id)}
                    isSaving={updateFetcher.state !== 'idle'}
                    isDeleting={deleteFetcher.state !== 'idle'}
                    cardRef={(el) => {
                      commentRefs.current[c.id] = el;
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

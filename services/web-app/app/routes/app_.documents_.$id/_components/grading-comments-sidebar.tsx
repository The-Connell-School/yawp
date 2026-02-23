import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import {
  GradeCommentCard,
  type GradeComment as CardGradeComment,
} from '~/components/grade-comment-card';
import { findExcerptRange } from '~/utils/excerpt-position';

type GradeComment = CardGradeComment & {
  excerpt: string | null;
  occurrence?: number | null;
  createdAt: Date | string;
  responses: {
    id: string;
    content: string;
    createdAt: Date | string;
    profile: { user: { name: string | null; email: string } };
  }[];
};

type DraftComment = {
  id: 'draft';
  excerpt: string | null;
  occurrence: number;
  createdAt: Date;
};

function isDraftComment(
  c: GradeComment | DraftComment
): c is DraftComment {
  return c.id === 'draft';
}

type Props = {
  gradeComments: GradeComment[];
  gradeId: string | null;
  snapshotId: string | null;
  sourceText: string;
  activeGradeCommentId?: string | null;
  onSelectGradeComment?: (id: string) => void;
  onDraftHighlightChange?: (highlight: { excerpt: string; occurrence: number } | null) => void;
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
  gradeComments,
  gradeId,
  snapshotId,
  sourceText,
  activeGradeCommentId = null,
  onSelectGradeComment,
  onDraftHighlightChange,
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
      if (typeof excerpt === 'string' && typeof occurrence === 'number') {
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
      (!gradeId && !snapshotId) ||
      !draftComment?.excerpt
    )
      return;

    const form = new FormData();
    if (gradeId) form.append('gradeId', gradeId);
    if (!gradeId && snapshotId) form.append('snapshotId', snapshotId);
    form.append('content', draftContent.trim());
    if (draftComment?.excerpt) {
      form.append('excerpt', draftComment.excerpt);
      form.append('occurrence', draftComment.occurrence.toString());
    }
    createFetcher.submit(form, {
      method: 'POST',
      action: '/api/model/grade-comment',
    });
  };

  useEffect(() => {
    if (createFetcher.data?.success && createFetcher.state === 'idle') {
      setDraftComment(null);
      setDraftContent('');
      window.location.reload();
    }
  }, [createFetcher.data, createFetcher.state]);

  const cancelDraft = () => {
    setDraftComment(null);
    setDraftContent('');
  };

  const deleteComment = (commentId: string) => {
    deleteFetcher.submit(null, {
      method: 'DELETE',
      action: `/api/model/grade-comment/${commentId}`,
    });
  };

  const openEditComment = (comment: CardGradeComment) => {
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
      action: `/api/model/grade-comment/${editingCommentId}`,
    });
  };

  useEffect(() => {
    if (deleteFetcher.data?.success && deleteFetcher.state === 'idle') {
      window.location.reload();
    }
  }, [deleteFetcher.data, deleteFetcher.state]);

  useEffect(() => {
    if (updateFetcher.data?.success && updateFetcher.state === 'idle') {
      setEditingCommentId(null);
      setEditCommentContent('');
      window.location.reload();
    }
  }, [updateFetcher.data, updateFetcher.state]);

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

  const combinedItems = draftComment
    ? sortByDocumentLocation(
        [...gradeComments, draftComment],
        sourceText,
        (c) => ('excerpt' in c ? c.excerpt : null),
        (c) => ('occurrence' in c ? c.occurrence : 1)
      )
    : gradeComments;

  return (
    <div className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll md:w-3/5">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b p-2">
          <h2 className="text-sm font-semibold">Grade comments</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {combinedItems.length === 0 ? (
            <p
              className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground"
              title="Select text in the document, then click Comment in the toolbar"
            >
              Select text and click Comment to add feedback.
            </p>
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
                  <GradeCommentCard
                    key={c.id}
                    comment={c}
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

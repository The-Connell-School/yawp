import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { MessageCirclePlus } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

type GradeComment = {
  id: string;
  excerpt: string | null;
  occurrence?: number | null;
  content: string;
  createdAt: Date | string;
  profile: { user: { name: string | null; email: string } };
  responses: {
    id: string;
    content: string;
    createdAt: Date | string;
    profile: { user: { name: string | null; email: string } };
  }[];
};

type Props = {
  gradeComments: GradeComment[];
  gradeId: string | null;
  activeGradeCommentId?: string | null;
  onSelectGradeComment?: (id: string) => void;
};

function formatExcerpt(excerpt: string | null, maxChars = 90) {
  const text = (excerpt ?? 'General').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function GradingCommentsSidebar({
  gradeComments,
  gradeId,
  activeGradeCommentId = null,
  onSelectGradeComment,
}: Props) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [pendingSelection, setPendingSelection] = useState<{
    excerpt: string;
    occurrence: number;
  } | null>(null);
  const getSelectionInfoRef = useRef<
    (() => { excerpt: string; occurrence: number } | null) | null
  >(null);
  const createFetcher = useFetcher<{ success?: boolean }>();
  const deleteFetcher = useFetcher<{ success?: boolean }>();
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent;
      getSelectionInfoRef.current = ev.detail?.getSelectionInfo ?? null;
    };
    window.addEventListener('editor-ready', handler);
    return () => window.removeEventListener('editor-ready', handler);
  }, []);

  const openAddComment = () => {
    setPendingSelection(getSelectionInfoRef.current?.() ?? null);
    setNewCommentContent('');
    setIsAddOpen(true);
  };

  const submitAddComment = () => {
    if (!newCommentContent.trim() || !gradeId) return;

    const form = new FormData();
    form.append('gradeId', gradeId);
    form.append('content', newCommentContent.trim());
    if (pendingSelection) {
      form.append('excerpt', pendingSelection.excerpt);
      form.append('occurrence', pendingSelection.occurrence.toString());
    }
    createFetcher.submit(form, {
      method: 'POST',
      action: '/api/model/grade-comment',
    });
  };

  useEffect(() => {
    if (createFetcher.data?.success && createFetcher.state === 'idle') {
      setIsAddOpen(false);
      setPendingSelection(null);
      window.location.reload();
    }
  }, [createFetcher.data, createFetcher.state]);

  const deleteComment = (commentId: string) => {
    deleteFetcher.submit(null, {
      method: 'DELETE',
      action: `/api/model/grade-comment/${commentId}`,
    });
  };

  useEffect(() => {
    if (deleteFetcher.data?.success && deleteFetcher.state === 'idle') {
      window.location.reload();
    }
  }, [deleteFetcher.data, deleteFetcher.state]);

  useEffect(() => {
    if (!activeGradeCommentId) return;
    commentRefs.current[activeGradeCommentId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeGradeCommentId]);

  return (
    <div className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll md:w-3/5">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b p-2">
          <h2 className="text-sm font-semibold">Grade comments</h2>
          {gradeId ? (
            <Button
              size="sm"
              onClick={openAddComment}
              disabled={createFetcher.state !== 'idle'}
            >
              <MessageCirclePlus className="mr-2 h-4 w-4" />
              Add
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Save grade first
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {gradeComments.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No grade comments yet.
            </p>
          ) : (
            <div className="space-y-3">
              {gradeComments.map((c) => (
                <div
                  key={c.id}
                  data-grade-comment-card={c.id}
                  ref={(el) => {
                    commentRefs.current[c.id] = el;
                  }}
                  onClick={() => onSelectGradeComment?.(c.id)}
                  className={[
                    'w-full rounded-lg border bg-muted/40 p-3 text-left',
                    activeGradeCommentId === c.id
                      ? 'ring-2 ring-yellow-400'
                      : 'hover:border-yellow-300',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs italic text-muted-foreground">
                        {formatExcerpt(c.excerpt)}
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {c.profile.user.name || c.profile.user.email}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={deleteFetcher.state !== 'idle'}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteComment(c.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                  <p className="mt-1 text-sm">{c.content}</p>
                  {c.responses?.length ? (
                    <div className="mt-2 space-y-1 border-t pt-2">
                      {c.responses.map((r) => (
                        <div key={r.id} className="text-sm">
                          <span className="font-medium">
                            {r.profile.user.name || r.profile.user.email}:
                          </span>{' '}
                          {r.content}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) setPendingSelection(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add grading comment</DialogTitle>
          </DialogHeader>
          {pendingSelection ? (
            <p className="text-sm italic text-muted-foreground">
              "{pendingSelection.excerpt}"
            </p>
          ) : null}
          <Textarea
            value={newCommentContent}
            onChange={(e) => setNewCommentContent(e.target.value)}
            placeholder="Write your comment..."
            rows={5}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddOpen(false);
                setPendingSelection(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAddComment}
              disabled={
                !newCommentContent.trim() || createFetcher.state !== 'idle'
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

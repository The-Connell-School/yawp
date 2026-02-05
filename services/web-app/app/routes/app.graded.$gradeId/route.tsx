import { invariant } from '@epic-web/invariant';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  Link,
  useFetcher,
  useLoaderData,
} from 'react-router';
import { ArrowLeft, MessageCirclePlus, X } from 'lucide-react';
import { z } from 'zod';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Textarea } from '~/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { rubricCategories } from '~/domain/grading/rubric';
import { formatGrade } from '~/domain/grading/gradeMath';
import { isGradingAssistantEnabledForOrg } from '~/utils/featureFlags.server';

type GrammarIssue = {
  id: string;
  excerpt: string;
  occurrence?: number;
  kind: 'error' | 'style';
  ruleNumber?: number;
  rule?: string;
  message: string;
};

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function getTextNodes(root: HTMLElement) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((current = walker.nextNode())) {
    if (isTextNode(current)) nodes.push(current);
  }
  return nodes;
}

function applyExcerptHighlights(opts: {
  root: HTMLElement;
  highlights: { id: string; excerpt: string; occurrence?: number }[];
  dataAttr: string;
  className: string;
}) {
  const { root, highlights, dataAttr, className } = opts;
  const textNodes = getTextNodes(root);
  const ranges: { start: number; end: number; id: string }[] = [];

  let global = '';
  const nodeSpans: { node: Text; start: number; end: number }[] = [];
  let pos = 0;
  for (const node of textNodes) {
    const text = node.textContent ?? '';
    nodeSpans.push({ node, start: pos, end: pos + text.length });
    global += text;
    pos += text.length;
  }

  for (const h of highlights) {
    const excerpt = (h.excerpt ?? '').trim();
    if (!excerpt) continue;
    const targetOccurrence = h.occurrence ?? 1;
    let occurrence = 0;
    let from = 0;
    while (true) {
      const idx = global.indexOf(excerpt, from);
      if (idx === -1) break;
      occurrence += 1;
      if (occurrence === targetOccurrence) {
        ranges.push({ start: idx, end: idx + excerpt.length, id: h.id });
        break;
      }
      from = idx + excerpt.length;
    }
  }

  ranges.sort((a, b) => b.start - a.start);

  for (const r of ranges) {
    const startSpanIdx = nodeSpans.findIndex(
      (n) => r.start >= n.start && r.start <= n.end
    );
    const endSpanIdx = nodeSpans.findIndex(
      (n) => r.end >= n.start && r.end <= n.end
    );
    if (startSpanIdx === -1 || endSpanIdx === -1) continue;

    const startSpan = nodeSpans[startSpanIdx];
    const endSpan = nodeSpans[endSpanIdx];
    const range = document.createRange();
    range.setStart(startSpan.node, Math.max(0, r.start - startSpan.start));
    range.setEnd(endSpan.node, Math.max(0, r.end - endSpan.start));

    const wrapper = document.createElement('span');
    wrapper.setAttribute(dataAttr, r.id);
    wrapper.className = className;
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
  }
}

function getSelectionInfo(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const excerpt = selection.toString().trim();
  if (!excerpt || excerpt.length > 120) return null;

  const textNodes = getTextNodes(root);
  const nodeSpans: { node: Text; start: number; end: number }[] = [];
  let pos = 0;
  let global = '';
  for (const node of textNodes) {
    const t = node.textContent ?? '';
    nodeSpans.push({ node, start: pos, end: pos + t.length });
    global += t;
    pos += t.length;
  }

  const startNode = range.startContainer;
  if (!isTextNode(startNode)) return null;
  const span = nodeSpans.find((s) => s.node === startNode);
  if (!span) return null;
  const startOffset = span.start + range.startOffset;

  let occurrence = 0;
  let from = 0;
  while (true) {
    const idx = global.indexOf(excerpt, from);
    if (idx === -1) break;
    occurrence += 1;
    if (startOffset >= idx && startOffset <= idx + excerpt.length) {
      return { excerpt, occurrence };
    }
    from = idx + excerpt.length;
  }

  return { excerpt, occurrence: 1 };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.gradeId, 'No grade id found');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!isGradingAssistantEnabledForOrg(profile.organization.id)) {
    throw new Response('Not found', { status: 404 });
  }

  const grade = await prisma.grade.findFirst({
    where: {
      id: params.gradeId,
      snapshot: { document: { deletedAt: null } },
    },
    select: {
      id: true,
      createdAt: true,
      releasedAt: true,
      overallComment: true,
      rubricScores: true,
      numericPercentage: true,
      letterGrade: true,
      grammarIssues: true,
      snapshot: {
        select: {
          id: true,
          html: true,
          text: true,
          document: {
            select: {
              id: true,
              title: true,
              submittedAt: true,
              profileId: true,
              classId: true,
              profile: { select: { user: { select: { name: true, email: true } } } },
              class: { select: { teachers: { select: { profileId: true } } } },
            },
          },
        },
      },
    },
  });

  if (!grade) {
    throw new Response('Not found', { status: 404 });
  }

  const isStudentOwner = grade.snapshot.document.profileId === profile.id;
  const isTeacherOfClass = (grade.snapshot.document.class?.teachers ?? []).some(
    (t) => t.profileId === profile.id
  );

  if (!user?.isAdmin) {
    if (isStudentOwner) {
      if (!grade.releasedAt) throw new Response('Not found', { status: 404 });
    } else if (!isTeacherOfClass) {
      throw new Response('Not found', { status: 404 });
    }
  }

  const gradeComments = await prisma.gradeComment.findMany({
    where: { gradeId: grade.id },
    include: {
      profile: { include: { user: { select: { name: true, email: true } } } },
      responses: {
        include: {
          profile: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const archivedComments = await prisma.documentComment.findMany({
    where: {
      documentId: grade.snapshot.document.id,
      archivedAt: { not: null },
    },
    include: {
      profile: { include: { user: { select: { name: true, email: true } } } },
      responses: {
        include: {
          profile: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return dataResponse({
    grade,
    gradeComments,
    archivedComments,
    viewer: {
      isTeacher: isTeacherOfClass || !!user?.isAdmin,
      isStudent: isStudentOwner,
    },
  });
}

const CreateCommentSchema = z.object({
  content: z.string().min(1),
});

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const createFetcher = useFetcher<{ success?: boolean }>();
  const replyFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const [showGrammar, setShowGrammar] = useState(true);
  const [showOldComments, setShowOldComments] = useState(false);
  const [activeGradeCommentId, setActiveGradeCommentId] = useState<string | null>(
    null
  );

  const [isAddCommentOpen, setIsAddCommentOpen] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState('');

  const [tooltipIssueId, setTooltipIssueId] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const closeTooltipTimer = useRef<number | null>(null);

  const essayRef = useRef<HTMLDivElement>(null);
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const grammarIssues = useMemo(() => {
    const raw = data.grade.grammarIssues as any;
    const issues: GrammarIssue[] = raw?.issues ?? [];
    return Array.isArray(issues) ? issues : [];
  }, [data.grade.grammarIssues]);

  const gradeComments = useMemo(() => data.gradeComments, [data.gradeComments]);

  const gradeDisplay =
    formatGrade(data.grade.numericPercentage ?? null, data.grade.letterGrade ?? null) ??
    'Graded';

  useEffect(() => {
    const root = essayRef.current;
    if (!root) return;
    root.innerHTML = data.grade.snapshot.html;

    // Grade comments (green)
    applyExcerptHighlights({
      root,
      highlights: gradeComments.map((c) => ({
        id: c.id,
        excerpt: c.excerpt,
        occurrence: c.occurrence,
      })),
      dataAttr: 'data-grade-comment-id',
      className: 'grade-comment-mark',
    });

    // Grammar issues (purple)
    if (showGrammar) {
      applyExcerptHighlights({
        root,
        highlights: grammarIssues.map((i) => ({
          id: i.id,
          excerpt: i.excerpt,
          occurrence: i.occurrence,
        })),
        dataAttr: 'data-grammar-issue-id',
        className: 'grammar-issue',
      });
    }
  }, [data.grade.snapshot.html, gradeComments, grammarIssues, showGrammar]);

  useEffect(() => {
    const root = essayRef.current;
    if (!root) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const mark = target?.closest?.('[data-grade-comment-id]') as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (!id) return;
      setActiveGradeCommentId(id);
      commentRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const onMouseOver = (e: MouseEvent) => {
      if (!showGrammar) return;
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.('[data-grammar-issue-id]') as HTMLElement | null;
      if (!el) return;
      const id = el.getAttribute('data-grammar-issue-id');
      if (!id) return;
      if (closeTooltipTimer.current) window.clearTimeout(closeTooltipTimer.current);
      setTooltipIssueId(id);
      setTooltipRect(el.getBoundingClientRect());
    };

    const onMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.('[data-grammar-issue-id]') as HTMLElement | null;
      if (!el) return;
      closeTooltipTimer.current = window.setTimeout(() => {
        setTooltipIssueId(null);
        setTooltipRect(null);
      }, 120);
    };

    root.addEventListener('click', onClick);
    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mouseout', onMouseOut);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mouseout', onMouseOut);
    };
  }, [showGrammar]);

  const activeGrammarIssue = useMemo(() => {
    if (!tooltipIssueId) return null;
    return grammarIssues.find((i) => i.id === tooltipIssueId) ?? null;
  }, [grammarIssues, tooltipIssueId]);

  useEffect(() => {
    if (!tooltipRect) {
      setTooltipPos(null);
      return;
    }
    setTooltipPos({
      top: Math.min(window.innerHeight - 16, tooltipRect.bottom + 10),
      left: Math.min(window.innerWidth - 16, tooltipRect.left),
    });
  }, [tooltipRect]);

  const openAddComment = () => {
    if (!essayRef.current) return;
    const selection = getSelectionInfo(essayRef.current);
    if (!selection) return;
    setNewCommentContent('');
    setIsAddCommentOpen(true);
  };

  const submitAddComment = () => {
    if (!essayRef.current) return;
    const selection = getSelectionInfo(essayRef.current);
    if (!selection) return;
    const parsed = CreateCommentSchema.safeParse({ content: newCommentContent });
    if (!parsed.success) return;

    const form = new FormData();
    form.append('gradeId', data.grade.id);
    form.append('content', newCommentContent);
    form.append('excerpt', selection.excerpt);
    form.append('occurrence', selection.occurrence.toString());
    createFetcher.submit(form, { method: 'POST', action: '/api/model/grade-comment' });
  };

  useEffect(() => {
    if (createFetcher.data?.success && createFetcher.state === 'idle') {
      window.location.reload();
    }
  }, [createFetcher.data, createFetcher.state]);

  const reply = (commentId: string, content: string) => {
    const form = new FormData();
    form.append('commentId', commentId);
    form.append('content', content);
    replyFetcher.submit(form, { method: 'POST', action: '/api/model/grade-comment-response' });
  };

  useEffect(() => {
    if (replyFetcher.data?.success && replyFetcher.state === 'idle') {
      window.location.reload();
    }
  }, [replyFetcher.data, replyFetcher.state]);

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

  const exitTo = `/app/documents/${data.grade.snapshot.document.id}`;

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <nav className="flex w-full items-center gap-3 border-b px-3 py-2">
        <Button asChild variant="secondary" size="sm">
          <Link to={exitTo}>
            <ArrowLeft className="h-4" />
            Back
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {data.grade.snapshot.document.title}
          </div>
          <div className="text-xs text-muted-foreground">
            {data.grade.releasedAt ? 'Returned' : 'Graded'} • {gradeDisplay}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowGrammar((v) => !v)}
          >
            {showGrammar ? 'Hide grammar/syntax highlights' : 'Show grammar/syntax highlights'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowOldComments((v) => !v)}
          >
            {showOldComments ? 'Hide old comments' : 'Show old comments'}
          </Button>
        </div>
      </nav>

      <div className="flex h-full w-full overflow-hidden">
        {/* Left: rubric */}
        <aside className="hidden w-[360px] shrink-0 border-r bg-muted/30 p-4 overflow-y-auto md:block">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Grading</h2>
            <Badge variant={data.grade.releasedAt ? 'success' : 'secondary'}>
              {gradeDisplay}
            </Badge>
          </div>
          {data.grade.overallComment && (
            <div className="mt-3 rounded-lg border bg-white p-3 text-sm text-muted-foreground">
              {data.grade.overallComment}
            </div>
          )}
          <div className="mt-4 space-y-3">
            <div className="text-sm font-medium">Rubric Breakdown</div>
            {rubricCategories.map((cat) => {
              const rs = (data.grade.rubricScores as any)?.[cat.key];
              const score = rs?.score as number | undefined;
              const comment = rs?.comment as string | undefined;
              if (!score) return null;
              return (
                <div key={cat.key} className="rounded-lg border bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{cat.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {cat.description}
                      </div>
                    </div>
                    <Badge variant="secondary" className="whitespace-nowrap">
                      {score}/5
                    </Badge>
                  </div>
                  {cat.key === 'grammar_and_mechanics' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      className="px-0"
                      onClick={() => setShowGrammar((v) => !v)}
                    >
                      {showGrammar ? 'Hide specific grammar/syntax issues' : 'Show specific grammar/syntax issues'}
                    </Button>
                  )}
                  {comment ? (
                    <div className="mt-2 border-t pt-2 text-sm text-muted-foreground">
                      {comment}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: essay */}
        <section className="relative flex-1 overflow-hidden">
          <div
            className={[
              'h-full overflow-y-auto p-6 font-times',
              showOldComments ? '' : 'draft-comments-hidden',
              showGrammar ? '' : 'grammar-hidden',
            ].join(' ')}
          >
            <div ref={essayRef} className="prose max-w-none" />
          </div>
          {data.viewer.isTeacher && (
            <Button
              type="button"
              size="sm"
              className="absolute bottom-4 right-4 shadow"
              onClick={openAddComment}
            >
              <MessageCirclePlus className="mr-2 h-4 w-4" />
              Add grading comment
            </Button>
          )}
        </section>

        {/* Right: comments */}
        <aside className="w-[380px] shrink-0 border-l bg-muted/30 p-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Comments</h2>
          </div>

          <div className="mt-3 space-y-3">
            {gradeComments.length === 0 ? (
              <div className="rounded-lg border bg-white p-3 text-sm text-muted-foreground">
                No grading comments yet.
              </div>
            ) : (
              gradeComments.map((c: any) => (
                <div
                  key={c.id}
                  ref={(el) => {
                    commentRefs.current[c.id] = el;
                  }}
                  className={[
                    'rounded-lg border bg-white p-3',
                    activeGradeCommentId === c.id ? 'ring-2 ring-green-400' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {c.profile.user.name || c.profile.user.email}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.excerpt}
                      </div>
                    </div>
                    {data.viewer.isTeacher ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => deleteComment(c.id)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm">{c.content}</div>

                  {c.responses?.length ? (
                    <div className="mt-3 space-y-2 border-t pt-2">
                      {c.responses.map((r: any) => (
                        <div key={r.id} className="text-sm">
                          <span className="font-medium">
                            {r.profile.user.name || r.profile.user.email}:
                          </span>{' '}
                          {r.content}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <ReplyBox
                    disabled={
                      replyFetcher.state !== 'idle' ||
                      (data.viewer.isStudent && !data.grade.releasedAt)
                    }
                    onReply={(text) => reply(c.id, text)}
                  />
                </div>
              ))
            )}

            {showOldComments && data.archivedComments.length > 0 ? (
              <div className="pt-4">
                <div className="text-xs font-medium text-muted-foreground">
                  Old (drafting) comments
                </div>
                <div className="mt-2 space-y-2">
                  {data.archivedComments.map((c: any) => (
                    <div key={c.id} className="rounded-lg border bg-white p-3">
                      <div className="text-sm font-medium">
                        {c.profile.user.name || c.profile.user.email}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {c.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <Dialog open={isAddCommentOpen} onOpenChange={setIsAddCommentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add grading comment</DialogTitle>
          </DialogHeader>
          <Textarea
            value={newCommentContent}
            onChange={(e) => setNewCommentContent(e.target.value)}
            placeholder="Write your comment..."
            rows={5}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddCommentOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                submitAddComment();
                setIsAddCommentOpen(false);
              }}
              disabled={!newCommentContent.trim() || createFetcher.state !== 'idle'}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeGrammarIssue && tooltipPos ? (
        <div
          className="fixed z-50 max-w-sm rounded-lg border bg-white p-3 text-sm shadow"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translateY(0)',
          }}
          onMouseEnter={() => {
            if (closeTooltipTimer.current) window.clearTimeout(closeTooltipTimer.current);
          }}
          onMouseLeave={() => {
            setTooltipIssueId(null);
            setTooltipRect(null);
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                {activeGrammarIssue.kind === 'style' ? 'Style' : 'Grammar'}
                {activeGrammarIssue.ruleNumber
                  ? ` • Rule ${activeGrammarIssue.ruleNumber}`
                  : ''}
              </div>
              {activeGrammarIssue.rule ? (
                <div className="text-sm font-medium">{activeGrammarIssue.rule}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded p-1 hover:bg-muted"
              onClick={() => {
                setTooltipIssueId(null);
                setTooltipRect(null);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {activeGrammarIssue.message}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ReplyBox({
  disabled,
  onReply,
}: {
  disabled: boolean;
  onReply: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="mt-3 flex gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Reply..."
        disabled={disabled}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || !text.trim()}
        onClick={() => {
          onReply(text.trim());
          setText('');
        }}
      >
        Reply
      </Button>
    </div>
  );
}

import { invariant } from '@epic-web/invariant';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  Link,
  useLoaderData,
  useSearchParams,
} from 'react-router';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import useBreakpoint from '~/hooks/useBreakpoint';
import { cn } from '~/utils/misc';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
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

function formatExcerpt(excerpt: string | null, maxChars = 90) {
  const text = (excerpt ?? 'General').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

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
              profile: {
                select: { user: { select: { name: true, email: true } } },
              },
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
      if (!grade.releasedAt) {
        return redirectWithToast(
          `/app/documents/${grade.snapshot.document.id}`,
          {
            description: 'This grade has not been released yet.',
            type: 'error',
          }
        );
      }
    } else if (!isTeacherOfClass) {
      throw new Response('Not found', { status: 404 });
    }
  }

  const teacherProfileIds = new Set(
    (grade.snapshot.document.class?.teachers ?? []).map((t) => t.profileId)
  );

  const allGradeComments = await prisma.gradeComment.findMany({
    where: { gradeId: grade.id },
    include: {
      profile: { include: { user: { select: { name: true, email: true } } } },
      responses: {
        include: {
          profile: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  const gradeComments = allGradeComments.filter((comment) =>
    teacherProfileIds.has(comment.profileId)
  );

  return dataResponse({
    grade,
    gradeComments,
    viewer: {
      isTeacher: isTeacherOfClass || !!user?.isAdmin,
      isStudent: isStudentOwner,
    },
  });
}

export default function Route() {
  const data = useLoaderData<typeof loader>();
  const breakpoint = useBreakpoint();
  const isMobile = ['base', 'sm', 'md', 'lg'].includes(breakpoint ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'grading';
  const changeTab = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    setSearchParams(params);
  };

  const [showGrammar, setShowGrammar] = useState(true);
  const [activeGradeCommentId, setActiveGradeCommentId] = useState<
    string | null
  >(null);

  const [tooltipIssueId, setTooltipIssueId] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
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
    formatGrade(
      data.grade.numericPercentage ?? null,
      data.grade.letterGrade ?? null
    ) ?? 'Graded';

  const focusGradeComment = (id: string) => {
    setActiveGradeCommentId(id);
    const mark = essayRef.current?.querySelector<HTMLElement>(
      `[data-grade-comment-id="${id}"]`
    );
    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    commentRefs.current[id]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };

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
      const gradeMark = target?.closest?.(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (gradeMark) {
        const id = gradeMark.getAttribute('data-grade-comment-id');
        if (id) focusGradeComment(id);
        return;
      }
      const grammarEl = target?.closest?.(
        '[data-grammar-issue-id]'
      ) as HTMLElement | null;
      if (grammarEl && showGrammar) {
        const id = grammarEl.getAttribute('data-grammar-issue-id');
        if (id) {
          if (closeTooltipTimer.current)
            window.clearTimeout(closeTooltipTimer.current);
          setTooltipIssueId(id);
          setTooltipRect(grammarEl.getBoundingClientRect());
        }
      }
    };

    const onMouseOver = (e: MouseEvent) => {
      if (!showGrammar) return;
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(
        '[data-grammar-issue-id]'
      ) as HTMLElement | null;
      if (!el) return;
      const id = el.getAttribute('data-grammar-issue-id');
      if (!id) return;
      if (closeTooltipTimer.current)
        window.clearTimeout(closeTooltipTimer.current);
      setTooltipIssueId(id);
      setTooltipRect(el.getBoundingClientRect());
    };

    const onMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(
        '[data-grammar-issue-id]'
      ) as HTMLElement | null;
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
  }, [showGrammar, focusGradeComment]);

  useEffect(() => {
    const root = essayRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.grade-comment-mark').forEach((el) => {
      el.classList.remove('focused');
    });
    if (!activeGradeCommentId) return;
    root
      .querySelectorAll<HTMLElement>(
        `[data-grade-comment-id="${activeGradeCommentId}"]`
      )
      .forEach((el) => el.classList.add('focused'));
  }, [
    activeGradeCommentId,
    data.grade.snapshot.html,
    gradeComments,
    showGrammar,
  ]);

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

  useEffect(() => {
    if (!activeGradeCommentId) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const clickedInHighlight = target.closest('[data-grade-comment-id]');
      const clickedInCommentCard = target.closest('[data-grade-comment-card]');
      if (clickedInHighlight || clickedInCommentCard) return;
      setActiveGradeCommentId(null);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [activeGradeCommentId]);

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
            {showGrammar
              ? 'Hide grammar/syntax highlights'
              : 'Show grammar/syntax highlights'}
          </Button>
        </div>
      </nav>

      <Tabs onValueChange={changeTab} value={tab} className="lg:hidden">
        <TabsList className="w-full rounded-none border-b px-3">
          <TabsTrigger value="grading" className="w-full">
            Grading
          </TabsTrigger>
          <TabsTrigger value="document" className="w-full">
            Document
          </TabsTrigger>
          <TabsTrigger value="comments" className="w-full">
            Comments
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex h-full w-full overflow-hidden flex-col lg:flex-row">
        {/* Left: rubric - mobile: only when tab=grading; desktop: always */}
        <aside
          className={cn(
            'shrink-0 bg-muted/30 p-4 overflow-y-auto',
            isMobile
              ? tab === 'grading'
                ? 'block w-full border-b'
                : 'hidden'
              : 'hidden w-[360px] border-r lg:block'
          )}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Grading</h2>
            <Badge
              variant="secondary"
              className="border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200"
            >
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
                      {showGrammar
                        ? 'Hide specific grammar/syntax issues'
                        : 'Show specific grammar/syntax issues'}
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

        {/* Center: essay - mobile: only when tab=document; desktop: always */}
        <section
          className={cn(
            'relative flex-1 overflow-hidden min-w-0 min-h-0',
            isMobile && tab !== 'document' && 'hidden'
          )}
        >
          <div
            className={[
              'h-full overflow-y-auto p-6 font-times',
              showGrammar ? '' : 'grammar-hidden',
            ].join(' ')}
          >
            <div ref={essayRef} className="prose max-w-none" />
          </div>
        </section>

        {/* Right: comments - mobile: only when tab=comments; desktop: always */}
        <aside
          className={cn(
            'shrink-0 bg-muted/30 p-4 overflow-y-auto',
            isMobile
              ? tab === 'comments'
                ? 'block w-full flex-1 min-h-0'
                : 'hidden'
              : 'w-[380px] border-l'
          )}
        >
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
                  data-grade-comment-card={c.id}
                  ref={(el) => {
                    commentRefs.current[c.id] = el;
                  }}
                  className={[
                    'rounded-lg border bg-white p-3',
                    activeGradeCommentId === c.id
                      ? 'ring-2 ring-yellow-400'
                      : '',
                  ].join(' ')}
                  onClick={() => focusGradeComment(c.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {c.profile.user.name || c.profile.user.email}
                      </div>
                      <div className="truncate text-xs italic text-muted-foreground">
                        {formatExcerpt(c.excerpt)}
                      </div>
                    </div>
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
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {activeGrammarIssue && tooltipPos ? (
        <div
          className="fixed z-50 max-w-sm rounded-lg border bg-white p-3 text-sm shadow"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translateY(0)',
          }}
          onMouseEnter={() => {
            if (closeTooltipTimer.current)
              window.clearTimeout(closeTooltipTimer.current);
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
                <div className="text-sm font-medium">
                  {activeGrammarIssue.rule}
                </div>
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

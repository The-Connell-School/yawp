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
import { GradeCommentCard } from '~/components/grade-comment-card';
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
import { resolveGradeEssayContent } from '~/domain/grading/grade-essay-content';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { isDocumentSubmissionEnabledForSchool } from '~/utils/feature-flags.server';
import { findExcerptRange } from '~/utils/excerpt-position';

function sortByDocumentLocation<T extends { createdAt: Date | string }>(args: {
  items: T[];
  sourceText: string;
  getExcerpt: (item: T) => string | null | undefined;
  getOccurrence?: (item: T) => number | null | undefined;
}) {
  return [...args.items].sort((a, b) => {
    const aRange = findExcerptRange(
      args.sourceText,
      args.getExcerpt(a),
      args.getOccurrence?.(a) ?? 1
    );
    const bRange = findExcerptRange(
      args.sourceText,
      args.getExcerpt(b),
      args.getOccurrence?.(b) ?? 1
    );

    if (aRange && bRange) {
      if (aRange.start !== bRange.start) return aRange.start - bRange.start;
      return aRange.end - bRange.end;
    }
    if (aRange) return -1;
    if (bRange) return 1;

    return (
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  });
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

function resolveTextBoundary(root: HTMLElement, absoluteOffset: number) {
  const textNodes = getTextNodes(root);
  if (textNodes.length === 0) return null;

  const target = Math.max(0, absoluteOffset);
  let cursor = 0;

  for (const node of textNodes) {
    const length = node.textContent?.length ?? 0;
    const next = cursor + length;
    if (target <= next) {
      return {
        node,
        offset: Math.max(0, Math.min(length, target - cursor)),
      };
    }
    cursor = next;
  }

  const lastNode = textNodes[textNodes.length - 1];
  const lastLength = lastNode.textContent?.length ?? 0;
  return { node: lastNode, offset: lastLength };
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
  const highlightById = new Map(highlights.map((h) => [h.id, h]));

  let global = '';
  for (const node of textNodes) {
    const text = node.textContent ?? '';
    global += text;
  }

  for (const h of highlights) {
    const range = findExcerptRange(global, h.excerpt, h.occurrence ?? 1);
    if (!range) continue;
    const start = Math.max(0, Math.min(global.length, range.start));
    const end = Math.max(0, Math.min(global.length, range.end));
    if (end <= start) continue;
    ranges.push({ start, end, id: h.id });
  }

  ranges.sort((a, b) => b.start - a.start);

  for (const r of ranges) {
    const startBoundary = resolveTextBoundary(root, r.start);
    const endBoundary = resolveTextBoundary(root, r.end);
    if (!startBoundary || !endBoundary) continue;
    if (
      startBoundary.node === endBoundary.node &&
      startBoundary.offset >= endBoundary.offset
    ) {
      continue;
    }

    const source = highlightById.get(r.id);
    if (!source) continue;

    const currentNodes = getTextNodes(root);
    const startIndex = currentNodes.indexOf(startBoundary.node);
    const endIndex = currentNodes.indexOf(endBoundary.node);
    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) continue;

    for (let nodeIndex = endIndex; nodeIndex >= startIndex; nodeIndex--) {
      const node = currentNodes[nodeIndex];
      const nodeLength = node.textContent?.length ?? 0;
      const segmentStart = nodeIndex === startIndex ? startBoundary.offset : 0;
      const segmentEnd = nodeIndex === endIndex ? endBoundary.offset : nodeLength;
      if (segmentEnd <= segmentStart) continue;

      const segmentRange = document.createRange();
      try {
        segmentRange.setStart(node, segmentStart);
        segmentRange.setEnd(node, segmentEnd);
      } catch {
        continue;
      }
      if (segmentRange.collapsed) continue;

      const wrapper = document.createElement('span');
      wrapper.setAttribute(dataAttr, r.id);
      wrapper.className = className;
      try {
        segmentRange.surroundContents(wrapper);
      } catch {
        wrapper.appendChild(segmentRange.extractContents());
        segmentRange.insertNode(wrapper);
      }
    }
  }
}

function getSelectionInfo(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const excerpt = selection.toString().trim();
  if (!excerpt) return null;

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

  const grade = await (prisma as any).grade.findFirst({
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
      essayText: true,
      essayHtml: true,
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
              class: {
                select: {
                  schoolId: true,
                  teachers: { select: { profileId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!grade) {
    throw new Response('Not found', { status: 404 });
  }

  const gradingEnabled = await isDocumentSubmissionEnabledForSchool(
    grade.snapshot.document.class?.schoolId
  );
  if (!gradingEnabled) {
    throw new Response('Not found', { status: 404 });
  }

  const isStudentOwner = grade.snapshot.document.profileId === profile.id;
  const isTeacherOfClass = (grade.snapshot.document.class?.teachers ?? []).some(
    (t: { profileId: string }) => t.profileId === profile.id
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
    (grade.snapshot.document.class?.teachers ?? []).map(
      (t: { profileId: string }) => t.profileId
    )
  );

  const allGradeComments = await prisma.gradeComment.findMany({
    where: { gradeId: grade.id },
    include: {
      profile: {
        include: {
          user: { select: { name: true, email: true, isAdmin: true } },
        },
      },
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
  const gradeComments = sortByDocumentLocation({
    items: allGradeComments.filter((comment) =>
      teacherProfileIds.has(comment.profileId) || comment.profile.user.isAdmin
    ),
    sourceText: resolveGradeEssayContent(grade).essayText,
    getExcerpt: (comment) => comment.excerpt,
    getOccurrence: (comment) => comment.occurrence,
  });

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
    setSearchParams(params, { replace: true });
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

  const { essayText, essayHtml } = useMemo(
    () => resolveGradeEssayContent(data.grade as any),
    [data.grade]
  );

  const essayRef = useRef<HTMLDivElement>(null);
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const grammarIssues = useMemo(() => {
    return parseGrammarIssuesPayload(data.grade.grammarIssues, {
      sourceText: essayText,
    });
  }, [data.grade.grammarIssues, essayText]);

  const gradeComments = useMemo(() => data.gradeComments, [data.gradeComments]);

  const gradeDisplay =
    formatGrade(
      data.grade.numericPercentage ?? null,
      data.grade.letterGrade ?? null
    ) ?? 'Graded';
  const revisePath = `/app/documents/${data.grade.snapshot.document.id}?revise=1`;
  const viewGradePath = `/app/graded/${data.grade.id}`;

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
    root.innerHTML = essayHtml;

    // Grade comments (green)
    applyExcerptHighlights({
      root,
      highlights: gradeComments.map((c) => ({
        id: c.id,
        excerpt: c.excerpt ?? '',
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
  }, [essayHtml, gradeComments, grammarIssues, showGrammar]);

  useEffect(() => {
    const root = essayRef.current;
    if (!root) return;

    const setGradeHover = (id: string, hovered: boolean) => {
      root
        .querySelectorAll<HTMLElement>(`[data-grade-comment-id="${id}"]`)
        .forEach((el) => {
          el.classList.toggle('hovered', hovered);
        });
    };

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
      const target = e.target as HTMLElement | null;
      const gradeEl = target?.closest?.(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (gradeEl) {
        const id = gradeEl.getAttribute('data-grade-comment-id');
        if (id) {
          const relatedTarget = e.relatedTarget as HTMLElement | null;
          const relatedGradeEl = relatedTarget?.closest?.(
            '[data-grade-comment-id]'
          ) as HTMLElement | null;
          const relatedId = relatedGradeEl?.getAttribute('data-grade-comment-id');
          if (relatedId !== id) {
            setGradeHover(id, true);
          }
        }
      }

      if (!showGrammar) return;
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
      const gradeEl = target?.closest?.(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (gradeEl) {
        const id = gradeEl.getAttribute('data-grade-comment-id');
        if (id) {
          const relatedTarget = e.relatedTarget as HTMLElement | null;
          const relatedGradeEl = relatedTarget?.closest?.(
            '[data-grade-comment-id]'
          ) as HTMLElement | null;
          const relatedId = relatedGradeEl?.getAttribute('data-grade-comment-id');
          if (relatedId !== id) {
            setGradeHover(id, false);
          }
        }
      }

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
      root
        .querySelectorAll<HTMLElement>('.grade-comment-mark.hovered')
        .forEach((el) => el.classList.remove('hovered'));
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
    essayHtml,
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

  const exitTo = data.viewer.isStudent
    ? '/app'
    : `/app/documents/${data.grade.snapshot.document.id}`;

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
          {data.viewer.isStudent ? (
            <div className="hidden md:flex items-center gap-1 rounded-full border bg-muted/40 p-1">
              <Button size="sm" variant="secondary" asChild>
                <Link to={viewGradePath}>View Grade</Link>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to={revisePath}>Revise Essay</Link>
              </Button>
            </div>
          ) : null}
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
                <GradeCommentCard
                  key={c.id}
                  comment={c}
                  isActive={activeGradeCommentId === c.id}
                  onClick={() => focusGradeComment(c.id)}
                  readOnly
                  cardRef={(el) => {
                    commentRefs.current[c.id] = el;
                  }}
                />
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

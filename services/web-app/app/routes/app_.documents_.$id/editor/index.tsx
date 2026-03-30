import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { findExcerptRange } from '~/utils/excerpt-position';
import { documentStore } from '~/utils/document-store';
import { SyncService, type SyncStatus } from '~/utils/sync-service';
import { contentHash } from '~/utils/content-hash';
import { useCommentsSelection } from '../comments/selection-context';
import { getSelectionInfo } from '../_components/grading-selection-utils';
import { Bar } from './bar';
import { GradingSelectionToolbar } from './grading-selection-toolbar';
import { ErrorBoundary } from './error-boundry';
import { Comment, CommentExtension } from './extensions/comment';
import { LineHeight } from './extensions/line-height';
import { TabIndent } from './extensions/tab-indent';

const PASTE_ALERT_MIN_CHARS = 200;

const extensions = [
  TabIndent,
  LineHeight,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
  }),
  Color.configure({ types: [TextStyle.name, ListItem.name] }),
  // @ts-ignore
  TextStyle.configure({ types: [ListItem.name] }),
  StarterKit.configure({
    bulletList: { keepMarks: true, keepAttributes: false },
    orderedList: { keepMarks: true, keepAttributes: false },
  }),
  Highlight.extend({
    addAttributes() {
      return {
        id: { default: null, renderHTML: ({ id }) => ({ id }) },
        class: {
          default: null,
          renderHTML: ({ class: cn }) => ({ class: cn }),
        },
      };
    },
  }),
  Comment,
  CommentExtension,
];

type GradeHighlight = {
  id: string;
  excerpt: string | null;
  occurrence?: number | null;
  dataAttr?: 'data-grade-comment-id' | 'data-grammar-issue-id';
  className?: string;
};

export type EditorBridge = {
  getContent: () => { html: string; text: string };
  setContent: (html: string) => void;
  saveNow: (options?: { source?: string }) => Promise<void>;
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

function clearReviewMarks(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      '[data-grade-comment-id], [data-grammar-issue-id]'
    )
    .forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (!parent) return;
      while (wrapper.firstChild)
        parent.insertBefore(wrapper.firstChild, wrapper);
      parent.removeChild(wrapper);
      parent.normalize();
    });
}

function applyReviewHighlights(
  root: HTMLElement,
  highlights: GradeHighlight[]
) {
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
    const dataAttr = source.dataAttr ?? 'data-grade-comment-id';
    const className = source.className ?? 'grade-comment-mark';

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
        // Fallback when the browser rejects surroundContents due to stale boundaries.
        wrapper.appendChild(segmentRange.extractContents());
        segmentRange.insertNode(wrapper);
      }
    }
  }
}

type Props = {
  docId: string;
  docHtml: string | null;
  initialRevision: number;
  editorSessionId: string;
  saveSnapshotId?: string | null;
  isEditable?: boolean;
  gradeHighlights?: GradeHighlight[];
  activeGradeCommentId?: string | null;
  onGradeCommentSelect?: (id: string) => void;
  onGrammarIssueHover?: (id: string | null, rect: DOMRect | null) => void;
  onContentSnapshot?: (content: { html: string; text: string }) => void;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onEditorBridgeReady?: (bridge: EditorBridge | null) => void;
};

export const Editor = ({
  docId,
  docHtml,
  initialRevision,
  editorSessionId,
  saveSnapshotId = null,
  isEditable = true,
  gradeHighlights = [],
  activeGradeCommentId = null,
  onGradeCommentSelect,
  onGrammarIssueHover,
  onContentSnapshot,
  onSyncStatusChange,
  onEditorBridgeReady,
}: Props) => {
  const [selectionToolbarRect, setSelectionToolbarRect] = useState<DOMRect | null>(null);

  // --- Local-first save integration ---
  const syncServiceRef = useRef<SyncService | null>(null);
  const {
    activeCommentId,
    hoveredCommentId,
    setActiveCommentId,
    setHoveredCommentId,
  } = useCommentsSelection();
  const editor = useEditor({
    extensions,
    content: docHtml,
    immediatelyRender: false,
    editable: isEditable,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditable);
  }, [editor, isEditable]);

  useEffect(() => {
    if (!editor || isEditable) return;
    const root = editor.view.dom as HTMLElement;
    clearReviewMarks(root);
    applyReviewHighlights(root, gradeHighlights);
  }, [editor, isEditable, gradeHighlights]);

  useEffect(() => {
    if (!editor || isEditable) return;
    const root = editor.view.dom as HTMLElement;
    root.querySelectorAll<HTMLElement>('.grade-comment-mark').forEach((el) => {
      el.classList.remove('focused');
    });
    if (!activeGradeCommentId) return;
    root
      .querySelectorAll<HTMLElement>(
        `[data-grade-comment-id="${activeGradeCommentId}"]`
      )
      .forEach((el) => el.classList.add('focused'));
  }, [editor, isEditable, activeGradeCommentId]);

  useEffect(() => {
    if (!editor || isEditable || !activeGradeCommentId) return;
    const root = editor.view.dom as HTMLElement;
    const first = root.querySelector<HTMLElement>(
      `[data-grade-comment-id="${activeGradeCommentId}"]`
    );
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editor, isEditable, activeGradeCommentId]);

  useEffect(() => {
    if (!editor || isEditable || !onGradeCommentSelect) return;
    const root = editor.view.dom as HTMLElement;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (!id) return;
      onGradeCommentSelect(id);
    };

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [editor, isEditable, onGradeCommentSelect]);

  useEffect(() => {
    if (!editor || isEditable) return;
    const root = editor.view.dom as HTMLElement;

    const setGradeHover = (id: string, hovered: boolean) => {
      root
        .querySelectorAll<HTMLElement>(`[data-grade-comment-id="${id}"]`)
        .forEach((el) => {
          el.classList.toggle('hovered', hovered);
        });
    };

    const onMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (!id) return;

      const relatedTarget = event.relatedTarget as HTMLElement | null;
      const relatedMark = relatedTarget?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (relatedMark?.getAttribute('data-grade-comment-id') === id) return;

      setGradeHover(id, true);
    };

    const onMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (!id) return;

      const relatedTarget = event.relatedTarget as HTMLElement | null;
      const relatedMark = relatedTarget?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (relatedMark?.getAttribute('data-grade-comment-id') === id) return;

      setGradeHover(id, false);
    };

    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mouseout', onMouseOut);
    return () => {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mouseout', onMouseOut);
      root
        .querySelectorAll<HTMLElement>('.grade-comment-mark.hovered')
        .forEach((el) => el.classList.remove('hovered'));
    };
  }, [editor, isEditable]);

  useEffect(() => {
    if (!editor || isEditable || !onGrammarIssueHover) return;
    const root = editor.view.dom as HTMLElement;

    const onMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grammar-issue-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grammar-issue-id');
      if (!id) return;
      onGrammarIssueHover(id, mark.getBoundingClientRect());
    };

    const onMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grammar-issue-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      onGrammarIssueHover(null, null);
    };

    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mouseout', onMouseOut);
    return () => {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mouseout', onMouseOut);
    };
  }, [editor, isEditable, onGrammarIssueHover]);

  // Register editor content getter and selection getter with context
  useEffect(() => {
    if (!editor) return;

    const event = new CustomEvent('editor-ready', {
      detail: {
        getContent: () => ({
          html: editor.getHTML(),
          text: editor.getText(),
        }),
        getSelectionInfo: () =>
          getSelectionInfo(editor.view.dom as HTMLElement),
      },
    });
    window.dispatchEvent(event);
  }, [editor]);

  useEffect(() => {
    if (!editor || !isEditable) return;

    const getContentSnapshot = () => ({
      html: editor.getHTML(),
      text: editor.getText().replace(/\u00A0/g, ' '),
    });

    // Initialize SyncService
    const syncService = new SyncService(documentStore);
    syncServiceRef.current = syncService;

    const unsubStatus = syncService.onStatusChange((status) => {
      onSyncStatusChange?.(status);
    });

    syncService.start(docId);

    // Seed IndexedDB with server content or recover unsynced local content
    void (async () => {
      const existing = await documentStore.get(docId);
      if (!existing || existing.syncStatus === 'synced') {
        const content = getContentSnapshot();
        const hash = await contentHash(content.html, content.text);
        await documentStore.put({
          docId,
          html: content.html,
          text: content.text,
          updatedAt: Date.now(),
          serverRevision: initialRevision,
          syncStatus: 'synced',
          lastSyncedAt: Date.now(),
          lastSyncError: null,
          contentHash: hash,
        });
        syncService.setLastSyncedHash(hash);
      } else {
        // Local entry has unsynced changes — recover it
        editor.commands.setContent(existing.html, false);
        syncService.forceSave();
      }
    })();

    // On every editor update: write to IndexedDB immediately, schedule server sync
    const onUpdate = async () => {
      const content = getContentSnapshot();
      const hash = await contentHash(content.html, content.text);
      const current = await documentStore.get(docId);
      await documentStore.put({
        docId,
        html: content.html,
        text: content.text,
        updatedAt: Date.now(),
        serverRevision: current?.serverRevision ?? initialRevision,
        syncStatus: 'pending',
        lastSyncedAt: current?.lastSyncedAt ?? null,
        lastSyncError: null,
        contentHash: hash,
      });
      syncService.scheduleSave();
    };

    const emitSnapshotDebounced = (() => {
      let timer: ReturnType<typeof setTimeout>;
      return () => {
        clearTimeout(timer);
        timer = setTimeout(() => onContentSnapshot?.(getContentSnapshot()), 400);
      };
    })();

    // Sync on visibility change
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void syncService.forceSave();
      }
    };

    onEditorBridgeReady?.({
      getContent: getContentSnapshot,
      setContent: (html: string) => {
        editor.commands.setContent(html, true);
      },
      saveNow: () => syncService.forceSave(),
    });

    onContentSnapshot?.(getContentSnapshot());
    editor.on('update', onUpdate);
    editor.on('update', emitSnapshotDebounced);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      // Force a final sync attempt before unmount
      void syncService.forceSave();
      syncService.stop();
      syncServiceRef.current = null;
      unsubStatus();
      onEditorBridgeReady?.(null);
      editor.off('update', onUpdate);
      editor.off('update', emitSnapshotDebounced);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [editor, docId, editorSessionId, initialRevision, isEditable, onContentSnapshot, onSyncStatusChange, onEditorBridgeReady]);

  useEffect(() => {
    if (!editor || !isEditable) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void syncServiceRef.current?.forceSave();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, isEditable]);

  useEffect(() => {
    if (!editor) return;

    // Track if content was copied from tutor messages
    const handleCopy = (event: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // Check if the selection contains or is within a tutor message element
      const tutorMessageElement = (
        container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : (container as Element)
      )?.closest('[data-tutor-message="true"]');

      if (tutorMessageElement) {
        // Store flag that content was copied from tutor message
        sessionStorage.setItem(`tutor-copy-${docId}`, 'true');
        // Clear flag after 5 seconds to prevent stale flags
        setTimeout(() => {
          sessionStorage.removeItem(`tutor-copy-${docId}`);
        }, 5000);
      }
    };

    const handlePaste = (event: ClipboardEvent) => {
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      const textLength = pastedText.length;

      // Only detect large pastes if they came from tutor messages
      const copiedFromTutor =
        sessionStorage.getItem(`tutor-copy-${docId}`) === 'true';

      if (textLength >= 200 && copiedFromTutor) {
        // Clear the flag after using it
        sessionStorage.removeItem(`tutor-copy-${docId}`);

        // Send paste alert to API asynchronously
        fetch('/api/paste-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: docId,
            textLength,
            content: pastedText,
          }),
        }).catch((err) => {
          console.error('Failed to log paste alert:', err);
        });
      }
    };

    // Listen for copy events on the entire document to catch copies from tutor messages
    document.addEventListener('copy', handleCopy);
    editor.view.dom.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('copy', handleCopy);
      editor.view.dom.removeEventListener('paste', handlePaste);
    };
  }, [editor, docId]);

  useEffect(() => {
    if (!editor) return;
    // Toggle classes on marks to reflect hovered/active state from context
    const allMarks = document.querySelectorAll<HTMLElement>('.comment-mark');
    allMarks.forEach((el) => el.classList.remove('focused'));
    if (hoveredCommentId) {
      document
        .querySelectorAll<HTMLElement>(
          `[data-comment-id="${hoveredCommentId}"]`
        )
        .forEach((el) => el.classList.add('focused'));
    }
    if (activeCommentId) {
      document
        .querySelectorAll<HTMLElement>(`[data-comment-id="${activeCommentId}"]`)
        .forEach((el) => el.classList.add('focused'));
    }
  }, [editor, activeCommentId, hoveredCommentId]);

  useEffect(() => {
    if (!editor || isEditable || !onGradeCommentSelect) return;
    const root = editor.view.dom as HTMLElement;

    const updateSelectionToolbar = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelectionToolbarRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setSelectionToolbarRect(null);
        return;
      }
      const excerpt = sel.toString().trim();
      if (!excerpt) {
        setSelectionToolbarRect(null);
        return;
      }
      setSelectionToolbarRect(range.getBoundingClientRect());
    };

    const onSelectionChange = () => {
      requestAnimationFrame(updateSelectionToolbar);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [editor, isEditable, onGradeCommentSelect]);

  const handleGradingCommentRequest = useCallback(() => {
    if (!editor) return;
    const info = getSelectionInfo(editor.view.dom as HTMLElement);
    if (!info) return;
    window.dispatchEvent(
      new CustomEvent('grading-comment-request', { detail: info })
    );
    window.getSelection()?.removeAllRanges();
    setSelectionToolbarRect(null);
  }, [editor]);

  useEffect(() => {
    // Bridge TipTap plugin custom events to context
    const onHover = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id) setHoveredCommentId(id);
    };
    const onUnhover = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id && hoveredCommentId === id) setHoveredCommentId(null);
    };
    const onActive = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id) setActiveCommentId(id);
    };
    window.addEventListener('document-comment-hover', onHover as any);
    window.addEventListener('document-comment-unhover', onUnhover as any);
    window.addEventListener('document-comment-active', onActive as any);
    return () => {
      window.removeEventListener('document-comment-hover', onHover as any);
      window.removeEventListener('document-comment-unhover', onUnhover as any);
      window.removeEventListener('document-comment-active', onActive as any);
    };
  }, [hoveredCommentId, setHoveredCommentId, setActiveCommentId]);

  return (
    <ErrorBoundary>
      <div className="flex w-full flex-col overflow-hidden border-r md:h-full">
        {isEditable ? (
          <Bar editor={editor} documentId={docId} isEditable={isEditable} />
        ) : null}
        <div className="no-scrollbar grow overflow-y-scroll p-5" key={`${docId}-editor`}>
          <div className="mx-auto w-full max-w-[920px] font-times">
            <EditorContent
              editor={editor}
              className="h-full pb-5 [&>div]:h-full [&>div]:outline-none"
            />
          </div>
        </div>
        {selectionToolbarRect && !isEditable && onGradeCommentSelect ? (
          <GradingSelectionToolbar
            rect={selectionToolbarRect}
            onCommentClick={handleGradingCommentRequest}
          />
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

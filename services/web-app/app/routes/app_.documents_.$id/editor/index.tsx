import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ListItem from '@tiptap/extension-list-item';
import TextStyle from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import { useCommentsSelection } from '../comments/selection-context';
import { getSelectionInfo } from '../_components/grading-selection-utils';
import { Bar } from './bar';
import { ErrorBoundary } from './error-boundry';
import { Comment, CommentExtension } from './extensions/comment';
import { LineHeight } from './extensions/line-height';

const debounce = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

const extensions = [
  LineHeight,
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
  className?: 'grade-comment-mark' | 'grammar-issue';
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

    const source = highlights.find((h) => h.id === r.id);
    const wrapper = document.createElement('span');
    wrapper.setAttribute(source?.dataAttr ?? 'data-grade-comment-id', r.id);
    wrapper.className = source?.className ?? 'grade-comment-mark';
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
  }
}

type Props = {
  docId: string;
  docHtml: string | null;
  setIsSaving: (isSaving: boolean) => void;
  isEditable?: boolean;
  gradeHighlights?: GradeHighlight[];
  activeGradeCommentId?: string | null;
  onGradeCommentSelect?: (id: string) => void;
  onGrammarIssueHover?: (id: string | null, rect: DOMRect | null) => void;
};

export const Editor = ({
  docId,
  docHtml,
  setIsSaving,
  isEditable = true,
  gradeHighlights = [],
  activeGradeCommentId = null,
  onGradeCommentSelect,
  onGrammarIssueHover,
}: Props) => {
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
    if (!editor) return;

    const save = async () => {
      setIsSaving(true);
      const html = editor.getHTML();
      const text = editor.getText();
      const formData = new FormData();
      formData.append('html', html);
      formData.append('text', text);
      await fetch(`/api/model/document/${docId}?from=editor`, {
        method: 'PUT',
        body: formData,
        keepalive: true,
      });
      setIsSaving(false);
    };

    const saveDebounced = debounce(save, 1500);

    editor.on('update', saveDebounced);
    editor.on('blur', save);

    return () => {
      editor.off('update', saveDebounced);
      editor.off('blur', save);
    };
  }, [editor, docId, setIsSaving]);

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
        <div
          className="no-scrollbar grow overflow-y-scroll p-5 font-times"
          key={`${docId}-editor`}
        >
          <EditorContent
            editor={editor}
            className="h-full pb-5 [&>div]:h-full [&>div]:outline-none"
          />
        </div>
      </div>
    </ErrorBoundary>
  );
};

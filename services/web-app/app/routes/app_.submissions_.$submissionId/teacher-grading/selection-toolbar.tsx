import { useCallback, useEffect, useState } from 'react';
import { GradingSelectionToolbar } from './grading-selection-toolbar';
import { getSelectionInfo } from '../_components/grading-selection-utils';

type Props = {
  contentRoot: HTMLElement | null;
};

export function SelectionToolbar({ contentRoot }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!contentRoot) return;

    const updateSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!contentRoot.contains(range.commonAncestorContainer)) {
        setRect(null);
        return;
      }
      const excerpt = sel.toString().trim();
      if (!excerpt) {
        setRect(null);
        return;
      }
      setRect(range.getBoundingClientRect());
    };

    const onSelectionChange = () => requestAnimationFrame(updateSelection);
    document.addEventListener('selectionchange', onSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', onSelectionChange);
  }, [contentRoot]);

  const handleCommentRequest = useCallback(() => {
    if (!contentRoot) return;
    const info = getSelectionInfo(contentRoot);
    if (!info) return;
    window.dispatchEvent(
      new CustomEvent('grading-comment-request', { detail: info })
    );
    window.getSelection()?.removeAllRanges();
    setRect(null);
  }, [contentRoot]);

  if (!rect) return null;
  return (
    <GradingSelectionToolbar
      rect={rect}
      onCommentClick={handleCommentRequest}
    />
  );
}

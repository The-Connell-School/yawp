import { useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';

type Props = {
  commentId: string;
  onReply: (content: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function MarginCommentReply({
  commentId,
  onReply,
  disabled = false,
  autoFocus = false,
}: Props) {
  const [expanded, setExpanded] = useState(autoFocus);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onReply(text);
    setDraft('');
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        className="doc-editor-comment-reply doc-editor-comment-reply-pill"
        data-testid={`comment-reply-input-${commentId}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
          requestAnimationFrame(() => textareaRef.current?.focus());
        }}
      >
        Reply…
      </button>
    );
  }

  return (
    <div
      className="doc-editor-comment-reply-expanded"
      data-testid={`comment-reply-expanded-${commentId}`}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        className="doc-editor-comment-reply-textarea"
        placeholder="Reply…"
        rows={2}
        value={draft}
        autoFocus
        disabled={disabled}
        data-testid={`comment-reply-body-${commentId}`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setDraft('');
            setExpanded(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || !draft.trim()}
          data-testid={`comment-reply-send-${commentId}`}
          onClick={submit}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
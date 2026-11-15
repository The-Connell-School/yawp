import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { useUser } from '~/hooks/useUser';
import { initialsForDisplayName } from './comment-highlight-excerpt';

type Props = {
  documentId: string;
  draftId: string;
  excerpt: string;
  onCancel: () => void;
  onCreated: (comment: unknown) => void;
};

export function MarginCommentDraftCard({
  documentId,
  draftId,
  excerpt,
  onCancel,
  onCreated,
}: Props) {
  const user = useUser();
  const fetcher = useFetcher({ key: 'create-document-comment' });
  const [body, setBody] = useState('');
  const authorName =
    user.name?.trim() || user.email?.trim() || 'New comment';

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.id) {
      onCreated(fetcher.data);
    }
  }, [fetcher.state, fetcher.data, onCreated]);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const formData = new FormData();
    formData.append('id', draftId);
    formData.append('content', trimmed);
    formData.append('documentId', documentId);
    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/model/document-comment',
    });
  };

  return (
    <div
      className="doc-editor-comment-card doc-editor-comment-card--draft ring-2 ring-[hsl(210_75%_49%)]"
      data-testid="margin-comment-draft-card"
      data-comment-card={draftId}
      id={`comment-${draftId}`}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[hsl(210_50%_90%)] text-[11px] font-bold text-[hsl(210_50%_30%)]"
          aria-hidden
        >
          {initialsForDisplayName(authorName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-[13px] text-[#1b1b1b]">{authorName}</b>
          <span className="text-[11px] text-[hsl(50_2.4%_36%)]">New comment</span>
        </span>
      </div>
      <span className="border-l-2 border-[hsl(40_90%_55%)] pl-2 text-xs italic text-[hsl(50_2.4%_36%)]">
        {excerpt.length > 120 ? `${excerpt.slice(0, 120)}…` : excerpt}
      </span>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment…"
        data-testid="margin-comment-draft-body"
        className="min-h-[72px] resize-none text-[13px]"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!body.trim() || fetcher.state !== 'idle'}
          data-testid="margin-comment-draft-submit"
          onClick={submit}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}
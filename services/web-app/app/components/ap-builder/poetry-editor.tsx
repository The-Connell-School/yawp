import * as React from 'react';
import { cn } from '~/utils/misc';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { PoetryRenderer } from '~/components/source-viewer/poetry-renderer';

interface PoetryEditorProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  poemTitle: string;
  onPoemTitleChange: (value: string) => void;
  poet: string;
  onPoetChange: (value: string) => void;
  poemBody: string;
  onPoemBodyChange: (value: string) => void;
  className?: string;
}

export function PoetryEditor({
  prompt,
  onPromptChange,
  poemTitle,
  onPoemTitleChange,
  poet,
  onPoetChange,
  poemBody,
  onPoemBodyChange,
  className,
}: PoetryEditorProps) {
  const [showPreview, setShowPreview] = React.useState(false);

  return (
    <div className={cn('space-y-6', className)}>
      <div>
        <label className="text-sm font-medium">Prompt</label>
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="The essay prompt students will respond to..."
          className="mt-1 min-h-[80px]"
        />
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">Poem</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={poemTitle}
              onChange={(e) => onPoemTitleChange(e.target.value)}
              placeholder="Poem title"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Poet
            </label>
            <Input
              value={poet}
              onChange={(e) => onPoetChange(e.target.value)}
              placeholder="Poet name"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Poem Text
            </label>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {showPreview ? (
            <div className="mt-1 rounded-md border bg-muted/30 p-4">
              <PoetryRenderer text={poemBody} />
            </div>
          ) : (
            <Textarea
              value={poemBody}
              onChange={(e) => onPoemBodyChange(e.target.value)}
              placeholder="Paste or type the poem here. Preserve line breaks exactly as they appear..."
              className="mt-1 min-h-[200px] font-mono text-sm"
            />
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Preserve line breaks exactly. Each line of poetry on its own line.
            Stanza breaks as blank lines.
          </p>
        </div>
      </div>
    </div>
  );
}

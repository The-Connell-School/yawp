import * as React from 'react';
import { cn } from '~/utils/misc';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';

interface PassageEditorProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  passageTitle: string;
  onPassageTitleChange: (value: string) => void;
  passageAuthor: string;
  onPassageAuthorChange: (value: string) => void;
  passageAttribution: string;
  onPassageAttributionChange: (value: string) => void;
  passageBody: string;
  onPassageBodyChange: (value: string) => void;
  className?: string;
}

export function PassageEditor({
  prompt,
  onPromptChange,
  passageTitle,
  onPassageTitleChange,
  passageAuthor,
  onPassageAuthorChange,
  passageAttribution,
  onPassageAttributionChange,
  passageBody,
  onPassageBodyChange,
  className,
}: PassageEditorProps) {
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
        <p className="text-sm font-semibold text-muted-foreground">Passage</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={passageTitle}
              onChange={(e) => onPassageTitleChange(e.target.value)}
              placeholder="Title of the passage or work"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Author
            </label>
            <Input
              value={passageAuthor}
              onChange={(e) => onPassageAuthorChange(e.target.value)}
              placeholder="Author name"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Attribution
          </label>
          <Input
            value={passageAttribution}
            onChange={(e) => onPassageAttributionChange(e.target.value)}
            placeholder="Publication, date, occasion"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Passage Text
          </label>
          <Textarea
            value={passageBody}
            onChange={(e) => onPassageBodyChange(e.target.value)}
            placeholder="Full text of the passage..."
            className="mt-1 min-h-[200px]"
          />
        </div>
      </div>
    </div>
  );
}

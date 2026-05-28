import * as React from 'react';
import { cn } from '~/utils/misc';
import { Textarea } from '~/components/ui/textarea';

interface ArgumentEditorProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  className?: string;
}

export function ArgumentEditor({
  prompt,
  onPromptChange,
  className,
}: ArgumentEditorProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <div>
        <label className="text-sm font-medium">Prompt</label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Include the quotation or claim students will respond to, followed by
          the essay task.
        </p>
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={`"The measure of a society is how it treats its most vulnerable members."\n\nIn a well-written essay, develop your position on...`}
          className="mt-2 min-h-[150px]"
        />
      </div>
    </div>
  );
}

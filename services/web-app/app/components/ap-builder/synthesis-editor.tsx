import * as React from 'react';
import { cn } from '~/utils/misc';
import { Textarea } from '~/components/ui/textarea';
import { Button } from '~/components/ui/button';
import { SourceSlot, type SourceSlotData } from './source-slot';

function makeLabel(index: number): string {
  return `Source ${String.fromCharCode(65 + index)}`;
}

function createEmptySource(index: number): SourceSlotData {
  return { label: makeLabel(index), title: '', attribution: '', body: '' };
}

interface SynthesisEditorProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  sources: SourceSlotData[];
  onSourcesChange: (sources: SourceSlotData[]) => void;
  className?: string;
}

export function SynthesisEditor({
  prompt,
  onPromptChange,
  sources,
  onSourcesChange,
  className,
}: SynthesisEditorProps) {
  const handleSourceChange = (
    index: number,
    field: keyof SourceSlotData,
    value: string
  ) => {
    const updated = [...sources];
    updated[index] = { ...updated[index], [field]: value };
    onSourcesChange(updated);
  };

  const handleAddSource = () => {
    if (sources.length >= 9) return;
    onSourcesChange([...sources, createEmptySource(sources.length)]);
  };

  const handleRemoveSource = (index: number) => {
    const updated = sources.filter((_, i) => i !== index);
    const relabeled = updated.map((s, i) => ({ ...s, label: makeLabel(i) }));
    onSourcesChange(relabeled);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...sources];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    const relabeled = updated.map((s, i) => ({ ...s, label: makeLabel(i) }));
    onSourcesChange(relabeled);
  };

  const handleMoveDown = (index: number) => {
    if (index >= sources.length - 1) return;
    const updated = [...sources];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const relabeled = updated.map((s, i) => ({ ...s, label: makeLabel(i) }));
    onSourcesChange(relabeled);
  };

  return (
    <div className={cn('space-y-6', className)}>
      <div>
        <label className="text-sm font-medium">Prompt</label>
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="The essay prompt students will respond to..."
          className="mt-1 min-h-[100px]"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            Sources ({sources.length})
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddSource}
            disabled={sources.length >= 9}
          >
            Add Source
          </Button>
        </div>

        {sources.map((source, index) => (
          <div key={index} className="relative">
            <SourceSlot
              index={index}
              source={source}
              onChange={handleSourceChange}
              onRemove={handleRemoveSource}
              canRemove={sources.length > 1}
            />
            <div className="absolute right-2 top-2 flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                className="h-6 w-6 p-0 text-xs"
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleMoveDown(index)}
                disabled={index >= sources.length - 1}
                className="h-6 w-6 p-0 text-xs"
              >
                ↓
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { createEmptySource, type SourceSlotData };

import * as React from 'react';
import { cn } from '~/utils/misc';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Button } from '~/components/ui/button';

export interface SourceSlotData {
  label: string;
  title: string;
  attribution: string;
  body: string;
}

interface SourceSlotProps {
  index: number;
  source: SourceSlotData;
  onChange: (index: number, field: keyof SourceSlotData, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  className?: string;
}

export function SourceSlot({
  index,
  source,
  onChange,
  onRemove,
  canRemove,
  className,
}: SourceSlotProps) {
  return (
    <div className={cn('rounded-md border p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted-foreground">
          {source.label}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(index)}
            className="text-xs text-destructive hover:text-destructive"
          >
            Remove
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Title
          </label>
          <Input
            value={source.title}
            onChange={(e) => onChange(index, 'title', e.target.value)}
            placeholder="Source document title"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Attribution
          </label>
          <Input
            value={source.attribution}
            onChange={(e) => onChange(index, 'attribution', e.target.value)}
            placeholder="Author, publication, date"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Source Text
        </label>
        <Textarea
          value={source.body}
          onChange={(e) => onChange(index, 'body', e.target.value)}
          placeholder="Full text of the source passage..."
          className="mt-1 min-h-[120px]"
        />
      </div>
    </div>
  );
}

import * as React from 'react';
import { cn } from '~/utils/misc';
import { Button } from '~/components/ui/button';
import type { SourceSlotData } from './source-slot';

interface PdfReviewPanelProps {
  parsedPrompt: string;
  parsedSources: SourceSlotData[];
  confidence?: Record<number, 'high' | 'medium' | 'low'>;
  onAccept: (prompt: string, sources: SourceSlotData[]) => void;
  onReject: () => void;
  className?: string;
}

export function PdfReviewPanel({
  parsedPrompt,
  parsedSources,
  confidence,
  onAccept,
  onReject,
  className,
}: PdfReviewPanelProps) {
  return (
    <div className={cn('rounded-md border bg-card p-4 space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">PDF Extraction Review</h3>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onReject}>
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onAccept(parsedPrompt, parsedSources)}
          >
            Use Extracted Content
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Extracted Prompt
        </p>
        <div className="rounded border bg-muted/30 p-3 text-sm">
          {parsedPrompt}
        </div>
      </div>

      {parsedSources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Extracted Sources ({parsedSources.length})
          </p>
          {parsedSources.map((source, index) => (
            <div
              key={index}
              className={cn(
                'rounded border p-3 text-sm',
                confidence?.[index] === 'low'
                  ? 'border-yellow-300 bg-yellow-50/50'
                  : 'bg-muted/30'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{source.label}</span>
                {confidence?.[index] && confidence[index] !== 'high' && (
                  <span className="text-xs text-yellow-600">
                    {confidence[index]} confidence
                  </span>
                )}
              </div>
              {source.title && (
                <p className="text-xs text-muted-foreground">{source.title}</p>
              )}
              {source.attribution && (
                <p className="text-xs italic text-muted-foreground">
                  {source.attribution}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                {source.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

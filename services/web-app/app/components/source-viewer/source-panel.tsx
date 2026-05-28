import * as React from 'react';
import { cn } from '~/utils/misc';
import { PoetryRenderer } from './poetry-renderer';

export interface SourcePassageData {
  label: string;
  title?: string;
  attribution?: string;
  body: string;
}

interface SourcePanelProps {
  source: SourcePassageData;
  mode?: 'prose' | 'poetry';
  className?: string;
}

export function SourcePanel({ source, mode = 'prose', className }: SourcePanelProps) {
  return (
    <div className={cn('rounded-md border bg-muted/30 p-4', className)}>
      <div className="mb-2 space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {source.label}
        </p>
        {source.title && (
          <p className="text-sm font-medium">{source.title}</p>
        )}
        {source.attribution && (
          <p className="text-xs italic text-muted-foreground">
            {source.attribution}
          </p>
        )}
      </div>

      <div className="mt-3 border-t pt-3">
        {mode === 'poetry' ? (
          <PoetryRenderer text={source.body} />
        ) : (
          <div className="prose prose-sm max-w-none text-sm leading-relaxed">
            {source.body.split('\n\n').map((paragraph, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

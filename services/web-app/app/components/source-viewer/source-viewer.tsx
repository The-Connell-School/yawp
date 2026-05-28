import * as React from 'react';
import { cn } from '~/utils/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { SourcePanel, type SourcePassageData } from './source-panel';

interface SourceViewerProps {
  sources: SourcePassageData[];
  mode?: 'prose' | 'poetry';
  className?: string;
}

export function SourceViewer({ sources, mode = 'prose', className }: SourceViewerProps) {
  if (sources.length === 0) return null;

  if (sources.length === 1) {
    return (
      <SingleSourceViewer
        source={sources[0]}
        mode={mode}
        className={className}
      />
    );
  }

  return (
    <MultiSourceViewer sources={sources} mode={mode} className={className} />
  );
}

interface SingleSourceViewerProps {
  source: SourcePassageData;
  mode?: 'prose' | 'poetry';
  className?: string;
}

function SingleSourceViewer({
  source,
  mode = 'prose',
  className,
}: SingleSourceViewerProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent">
        <span>
          {source.title || source.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {isOpen ? 'Collapse' : 'Expand'}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2">
          <SourcePanel source={source} mode={mode} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface MultiSourceViewerProps {
  sources: SourcePassageData[];
  mode?: 'prose' | 'poetry';
  className?: string;
}

function MultiSourceViewer({
  sources,
  mode = 'prose',
  className,
}: MultiSourceViewerProps) {
  return (
    <Tabs defaultValue={sources[0]?.label} className={cn('w-full', className)}>
      <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
        {sources.map((source) => (
          <TabsTrigger
            key={source.label}
            value={source.label}
            className="text-xs"
          >
            {source.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {sources.map((source) => (
        <TabsContent key={source.label} value={source.label} className="mt-2">
          <SourcePanel source={source} mode={mode} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export { type SourcePassageData } from './source-panel';

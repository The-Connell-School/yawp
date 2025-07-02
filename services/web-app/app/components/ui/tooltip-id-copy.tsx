import * as React from 'react';
import { Tooltip } from './tooltip';
import { Button } from './button';
import { Copy } from 'lucide-react';
import { cn } from '~/utils/misc';

export function TooltipIdCopy({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <Tooltip
      text={
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs select-all">{id}</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={handleCopy}
            className={cn('p-1', copied && 'text-green-600')}
            tabIndex={-1}
          >
            <Copy className="h-4 w-4" />
            <span className="sr-only">Copy ID</span>
          </Button>
          {copied && (
            <span className="text-xs text-green-600 ml-1">Copied!</span>
          )}
        </span>
      }
      delayDuration={1000}
    >
      <span className={className}>{children ?? id}</span>
    </Tooltip>
  );
}

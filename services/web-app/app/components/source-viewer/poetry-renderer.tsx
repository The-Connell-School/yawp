import * as React from 'react';
import { cn } from '~/utils/misc';
import { parsePoetryLines } from './parse-poetry-lines';

export type { PoetryLine } from './parse-poetry-lines';
export { parsePoetryLines } from './parse-poetry-lines';

interface PoetryRendererProps {
  text: string;
  className?: string;
  showLineNumbers?: boolean;
}

export function PoetryRenderer({
  text,
  className,
  showLineNumbers = true,
}: PoetryRendererProps) {
  const lines = React.useMemo(() => parsePoetryLines(text), [text]);

  return (
    <div className={cn('font-serif text-sm leading-relaxed', className)}>
      {lines.map((line, index) => {
        if (line.isStanzaBreak) {
          return <div key={index} className="h-4" />;
        }

        return (
          <div key={index} className="flex">
            {showLineNumbers && (
              <span className="mr-4 min-w-[2rem] select-none text-right text-xs text-muted-foreground leading-relaxed">
                {line.lineNumber % 5 === 0 || line.lineNumber === 1
                  ? line.lineNumber
                  : ''}
              </span>
            )}
            <span className="flex-1">{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}

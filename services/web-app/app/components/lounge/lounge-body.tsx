import { splitMentions } from '~/domain/lounge/mentions';
import { cn } from '~/utils/misc';

/**
 * A post or reply body: plain text with line breaks kept and mentions shown
 * as "@Name". An empty body (a question that is all title) renders nothing.
 */
export function LoungeBody({
  body,
  className,
  testId,
}: {
  body: string;
  className?: string;
  testId?: string;
}) {
  if (!body.trim()) return null;
  return (
    <p data-testid={testId} className={cn('whitespace-pre-wrap break-words leading-relaxed', className)}>
      {splitMentions(body).map((part, index) =>
        part.type === 'text' ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span key={index} className="font-medium text-primary">
            @{part.label}
          </span>
        )
      )}
    </p>
  );
}

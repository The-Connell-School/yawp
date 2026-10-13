import { splitMentions } from '~/domain/lounge/mentions';
import { cn } from '~/utils/misc';

/** A post or reply body: plain text with line breaks kept and mentions shown as "@Name". */
export function LoungeBody({ body, className }: { body: string; className?: string }) {
  return (
    <p className={cn('whitespace-pre-wrap break-words leading-relaxed', className)}>
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

import { Fragment } from 'react';
import { splitNumberedLead } from '~/domain/lounge/body-format';
import { splitMentions } from '~/domain/lounge/mentions';
import { cn } from '~/utils/misc';

/**
 * A post or reply body: plain text with line breaks kept and mentions shown
 * as "@Name". An empty body (a question that is all title) renders nothing.
 *
 * With `boldNumberedLeads` (posts from the YAWP! team, like the House Rules),
 * each numbered line's first sentence is bold, so a list of rules reads as
 * headers rather than one wall of text.
 */
export function LoungeBody({
  body,
  className,
  testId,
  boldNumberedLeads = false,
}: {
  body: string;
  className?: string;
  testId?: string;
  boldNumberedLeads?: boolean;
}) {
  if (!body.trim()) return null;
  const lines = body.split('\n');
  return (
    <p data-testid={testId} className={cn('whitespace-pre-wrap break-words leading-relaxed', className)}>
      {lines.map((line, index) => {
        const split = boldNumberedLeads ? splitNumberedLead(line) : null;
        return (
          <Fragment key={index}>
            {index > 0 ? '\n' : null}
            {split ? (
              <>
                <strong className="font-semibold text-foreground">{split.lead}</strong>
                <Mentions text={split.rest} />
              </>
            ) : (
              <Mentions text={line} />
            )}
          </Fragment>
        );
      })}
    </p>
  );
}

function Mentions({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((part, index) =>
        part.type === 'text' ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span key={index} className="font-medium text-primary">
            @{part.label}
          </span>
        )
      )}
    </>
  );
}

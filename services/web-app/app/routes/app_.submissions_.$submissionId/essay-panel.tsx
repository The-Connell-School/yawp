import { forwardRef } from 'react';

type Props = {
  html: string;
};

/**
 * Renders submission HTML as static formatted content.
 * Uses the same CSS classes as the document editor for visual consistency.
 * The forwarded ref is used by SelectionToolbar and GradeHighlightsOverlay.
 */
export const EssayPanel = forwardRef<HTMLDivElement, Props>(
  function EssayPanel({ html }, ref) {
    return (
      <div className="no-scrollbar grow overflow-y-scroll bg-muted/20 px-6 py-8">
        <div className="mx-auto w-full max-w-[760px] rounded-lg border bg-white px-10 py-10 shadow-sm font-times">
          <div
            ref={ref}
            className="h-full [&>*]:outline-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    );
  }
);

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
      <div
        className="no-scrollbar grow overflow-y-scroll p-5"
        data-testid="submission-essay-scroll"
      >
        <div className="mx-auto w-full max-w-[920px] font-times">
          <div
            ref={ref}
            className="submission-essay h-full pb-5 [&>*]:outline-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    );
  }
);

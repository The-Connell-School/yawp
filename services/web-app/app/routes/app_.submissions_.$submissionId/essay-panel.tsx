import { forwardRef } from 'react';
import { PASTED_SOURCE_VISIBLE_CLASS } from '../app_.documents_.$id/document-editor/extensions/pasted-source';

type Props = {
  html: string;
  /**
   * Paint the "pasted from outside the app" marks the submission HTML
   * already carries. Set when a teacher is reading someone else's work;
   * the student reading their own graded submission does not see them.
   */
  showPastedSource?: boolean;
};

/**
 * Renders submission HTML as static formatted content.
 * Uses the same CSS classes as the document editor for visual consistency.
 * The forwarded ref is used by SelectionToolbar and GradeHighlightsOverlay.
 */
export const EssayPanel = forwardRef<HTMLDivElement, Props>(
  function EssayPanel({ html, showPastedSource = false }, ref) {
    return (
      <div className="no-scrollbar grow overflow-y-scroll p-5">
        <div className="mx-auto w-full max-w-[920px] font-times">
          <div
            ref={ref}
            className={`submission-essay h-full pb-5 [&>*]:outline-none${
              showPastedSource ? ` ${PASTED_SOURCE_VISIBLE_CLASS}` : ''
            }`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    );
  }
);

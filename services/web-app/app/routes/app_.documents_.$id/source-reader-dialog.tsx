import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';

/**
 * The fields a provided document needs to be read full screen. Both the AP
 * History DBQ documents and the AP English Language passages/sources satisfy
 * this shape, so one reader serves both assignment panels.
 */
export type ReadableSource = {
  position: number;
  title: string;
  attribution: string;
  body: string;
  caption?: string | null;
  mediaType?: string;
  imageAlt?: string | null;
};

type Props = {
  /** The source being read, or null when the reader is closed. */
  source: ReadableSource | null;
  /**
   * How the panel already labels this source -- "Document 3", "Source A",
   * "Passage 1" -- so the reader's heading matches the strip the student
   * clicked, letter-numbered synthesis packets included.
   */
  sourceDesignation: string;
  onClose: () => void;
};

/**
 * A near-fullscreen reading view for a provided document. The assignment
 * panel's inline strip is fine for glancing, but a student working with a
 * 700-word passage or a DBQ document needs to actually read it — full width,
 * book-sized type, no competition from the rest of the page.
 */
/** Blank-line-separated paragraphs; single line breaks (verse) stay intact. */
function splitParagraphs(body: string): string[] {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [body];
}

export function SourceReaderDialog({
  source,
  sourceDesignation,
  onClose,
}: Props) {
  return (
    <Dialog open={source !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92dvh] w-[96vw] max-w-4xl flex-col overflow-hidden">
        {source ? (
          <>
            <DialogHeader className="shrink-0 border-b pb-3 pr-8 text-left">
              <DialogTitle className="text-lg leading-snug">
                {sourceDesignation}: {source.title}
              </DialogTitle>
              <DialogDescription>{source.attribution}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-prose py-6">
                {source.caption ? (
                  <p className="mb-6 text-sm italic text-muted-foreground">
                    {source.caption}
                  </p>
                ) : null}
                {source.mediaType === 'image' && source.imageAlt ? (
                  <p className="mb-6 text-sm font-medium text-muted-foreground">
                    [Visual source] {source.imageAlt}
                  </p>
                ) : null}
                {/*
                  Printed-page treatment, the way the exam hands the passage
                  over: serif body text and a paragraph number in the margin,
                  so student and tutor can point at "paragraph 4" the same way
                  the exam's line numbers let them point at a line.
                */}
                {splitParagraphs(source.body).map((paragraph, index) => (
                  <div key={index} className="relative mb-5">
                    <span
                      aria-hidden
                      className="absolute -left-10 top-1 hidden w-7 select-none text-right font-sans text-xs tabular-nums text-muted-foreground sm:block"
                    >
                      {index + 1}
                    </span>
                    <p className="whitespace-pre-wrap font-serif text-[17px] leading-8">
                      {paragraph}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

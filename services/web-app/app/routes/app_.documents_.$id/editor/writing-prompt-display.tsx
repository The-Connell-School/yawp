import { Badge } from '~/components/ui/badge';

type Props = {
  writingPrompt: {
    id: string;
    responseType: string | null;
    sections: { label: string; description: string | null }[];
  };
};

export function WritingPromptDisplay({ writingPrompt }: Props) {
  return (
    <div
      contentEditable={false}
      className="mb-6 select-none rounded-lg border bg-muted/50 font-sans"
    >
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-sm font-semibold text-muted-foreground">
          Writing Prompt
        </span>
      </div>
      <div className="p-4">
        <object
          data={`/api/writing-prompt/${writingPrompt.id}`}
          type="application/pdf"
          className="h-[500px] w-full rounded border"
        >
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            <p>
              Unable to display PDF.{' '}
              <a
                href={`/api/writing-prompt/${writingPrompt.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Download instead
              </a>
            </p>
          </div>
        </object>
        {writingPrompt.responseType === 'structured' &&
          writingPrompt.sections.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {writingPrompt.sections.map((section, i) => (
                <Badge key={i} variant="secondary">
                  {section.label}
                </Badge>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

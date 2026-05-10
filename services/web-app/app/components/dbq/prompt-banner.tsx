import type { DbqPrompt } from './types';

export function PromptBanner({ prompt }: { prompt: DbqPrompt }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <span>Prompt</span>
        <span aria-hidden>·</span>
        <span>
          Reasoning skill:{' '}
          <span className="font-medium text-foreground">
            {prompt.reasoningSkill}
          </span>
        </span>
        <span aria-hidden>·</span>
        <span>
          {prompt.dateWindow.from}–{prompt.dateWindow.to}
        </span>
      </div>
      <p className="text-base font-medium leading-relaxed">{prompt.prompt}</p>
    </div>
  );
}

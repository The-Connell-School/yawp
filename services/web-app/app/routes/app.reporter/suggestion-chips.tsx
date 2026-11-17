/**
 * Starter prompts on Yawp! Reporter. The page is cream (`--background`);
 * hover and keyboard focus lift the chip onto the same white sheet the
 * Lesson Planner chat uses (`--lp-border`, `--lp-sheet-shadow` in
 * lesson-planner-chat.css).
 */
export const reporterSuggestionChipClassName = [
  'rounded-xl border bg-background p-3 text-left text-sm transition-colors',
  'hover:border-[var(--lp-border)] hover:bg-white hover:shadow-[var(--lp-sheet-shadow)]',
  'focus-visible:border-[var(--lp-border)] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:shadow-[var(--lp-sheet-shadow)]',
  'disabled:pointer-events-none disabled:opacity-50',
].join(' ');

export function ReporterSuggestionChips({
  prompts,
  onPick,
  disabled,
}: {
  prompts: Array<{ id: string; label: string; prompt: string }>;
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
      {prompts.map((prompt) => (
        <button
          key={prompt.id}
          type="button"
          data-testid="reporter-suggestion-chip"
          disabled={disabled}
          onClick={() => onPick(prompt.prompt)}
          className={reporterSuggestionChipClassName}
        >
          <span className="font-medium">{prompt.label}</span>
        </button>
      ))}
    </div>
  );
}

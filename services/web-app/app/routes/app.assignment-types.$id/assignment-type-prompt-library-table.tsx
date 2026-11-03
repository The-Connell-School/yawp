import { useState, useEffect, type ReactNode } from 'react';
import { SearchIcon } from 'lucide-react';
import { PreviewAssignmentCreationControl } from '~/components/free-tier/preview-assignment-creation-control';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/utils/misc';

export const ASSIGNMENT_TYPE_PROMPT_LIBRARY_INITIAL_VISIBLE = 6;

export function PromptLibraryFilterPill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'h-[30px] shrink-0 rounded-full border px-3 text-[13px] text-foreground transition-colors',
        pressed
          ? 'border-foreground bg-muted'
          : 'border-border bg-card hover:bg-muted/50'
      )}
    >
      {children}
    </button>
  );
}

export function PromptLibrarySearchField({
  value,
  onChange,
  onCommit,
  placeholder = 'Search prompts',
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex h-9 min-w-[200px] max-w-[360px] flex-1 items-center">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute left-3 h-[15px] w-[15px] text-muted-foreground"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit(value);
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 bg-input-background pl-9"
      />
    </div>
  );
}

export function PromptLibraryEmptyState({
  showingOnlyMine,
}: {
  showingOnlyMine?: boolean;
}) {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      {showingOnlyMine
        ? 'You haven’t saved any prompts yet. Use New → Generate a prompt, then “Save prompt” (or “Use this prompt”) to keep one here.'
        : 'No prompts match the current filters.'}
    </p>
  );
}

export function PromptLibraryTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ul className="m-0 list-none p-0">{children}</ul>
    </div>
  );
}

export function PromptLibraryTableRow({
  primary,
  meta,
  isFirst,
  onSelect,
  assignmentCreationLocked = false,
}: {
  primary: ReactNode;
  meta?: ReactNode;
  isFirst: boolean;
  onSelect: () => void;
  assignmentCreationLocked?: boolean;
}) {
  const useButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={assignmentCreationLocked ? undefined : onSelect}
      className="h-8 shrink-0 rounded-full bg-card px-3 text-[13px] font-medium"
    >
      Use prompt
    </Button>
  );

  return (
    <li
      className={cn(
        'flex gap-4 px-4 py-3.5',
        !isFirst && 'border-t border-border'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="m-0 text-sm leading-normal text-foreground">{primary}</div>
        {meta ? (
          <p className="m-0 text-xs leading-normal text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      {assignmentCreationLocked ? (
        <PreviewAssignmentCreationControl>{useButton}</PreviewAssignmentCreationControl>
      ) : (
        useButton
      )}
    </li>
  );
}

export function PromptLibraryExpandableTable({
  itemCount,
  initialVisible = ASSIGNMENT_TYPE_PROMPT_LIBRARY_INITIAL_VISIBLE,
  showingOnlyMine,
  children,
}: {
  itemCount: number;
  initialVisible?: number;
  showingOnlyMine?: boolean;
  children: (visibleCount: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleCount = expanded ? itemCount : Math.min(itemCount, initialVisible);
  const hiddenCount = Math.max(0, itemCount - initialVisible);

  useEffect(() => {
    setExpanded(false);
  }, [itemCount]);

  if (itemCount === 0) {
    return <PromptLibraryEmptyState showingOnlyMine={showingOnlyMine} />;
  }

  return (
    <>
      <PromptLibraryTable>{children(visibleCount)}</PromptLibraryTable>
      {!expanded && hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start text-[13px] font-medium text-primary hover:underline"
        >
          Show {hiddenCount} more prompts
        </button>
      ) : null}
    </>
  );
}

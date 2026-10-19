import {
  BookOpen,
  ChevronDown,
  FilePenLine,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { menuState } from './page-helpers';

export function NewAssignment({
  hasClasses,
  library,
  generator,
  apHistory,
  promptCount,
  quotaLabel,
  onWrite,
  onGenerate,
  onCustom,
  mobile = false,
}: {
  hasClasses: boolean;
  library: boolean;
  generator: boolean;
  apHistory: boolean;
  promptCount: number;
  quotaLabel?: string | null;
  onWrite: () => void;
  onGenerate: () => void;
  onCustom: (type: 'dbq' | 'leq') => void;
  mobile?: boolean;
}) {
  const state = menuState({ hasClasses, library, generator, apHistory });
  const className = `rounded-full ${mobile ? 'w-full' : ''}`;
  if (state === 'no-classes')
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-disabled="true"
            data-tour="type-new"
            variant="secondary"
            className={`${className} text-muted-foreground`}
          >
            + New assignment
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="border-border">
          <p className="text-sm">Add a class before you assign this.</p>
          <Link
            to="/app/my-classes"
            className="mt-3 inline-block text-sm text-primary"
          >
            Go to My Classes ›
          </Link>
        </PopoverContent>
      </Popover>
    );
  if (state === 'plain')
    return (
      <Button data-tour="type-new" className={className} onClick={onWrite}>
        + New assignment
      </Button>
    );
  const itemClass = 'flex items-start gap-3 rounded-lg p-3';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-tour="type-new" className={className}>
          {apHistory
            ? 'Create assignment'
            : mobile
              ? '+ New assignment'
              : 'New assignment'}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side={mobile ? 'top' : 'bottom'}
        className="w-[min(340px,calc(100vw-32px))] border-border p-1.5"
      >
        {state === 'ap-history' ? (
          <>
            <DropdownMenuItem
              className={itemClass}
              onSelect={() => onCustom('dbq')}
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">New DBQ</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  A document-based question with its source set.
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={itemClass}
              onSelect={() => onCustom('leq')}
            >
              <FilePenLine className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">New LEQ</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  A long essay question.
                </span>
              </span>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem className={itemClass} onSelect={onWrite}>
              <Plus className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">Write a prompt</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Start New assignment with a blank prompt.
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={itemClass}
              onSelect={() => {
                document
                  .getElementById('prompt-library')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Run after the menu closes so Radix does not restore focus over the search.
                requestAnimationFrame(() =>
                  document
                    .getElementById('type-prompt-search')
                    ?.focus({ preventScroll: true })
                );
              }}
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">
                  Choose from the library
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Jump to the {promptCount} prompts for this type.
                </span>
              </span>
            </DropdownMenuItem>
            {state === 'library-generator' && (
              <DropdownMenuItem className={itemClass} onSelect={onGenerate}>
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Generate a prompt</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Describe what you’re teaching and get three drafts.
                  </span>
                </span>
              </DropdownMenuItem>
            )}
          </>
        )}
        {quotaLabel && (
          <p className="mt-1 border-t border-border px-3 pb-2 pt-3 text-xs text-muted-foreground">
            {quotaLabel}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

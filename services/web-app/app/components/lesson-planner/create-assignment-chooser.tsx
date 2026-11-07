/**
 * The teacher's say on what a step becomes in Yawp! (Kevin, Nov 6).
 *
 * The planner's guess (a pre-write to Pre-Writing, a quick write to Class
 * Starter) is right most of the time and stays one click away. When it is
 * wrong, the chevron beside it lists the other writing types the school has,
 * each a link to the same prompt in that type, so nobody is stuck making a
 * pre-write into a Class Starter.
 */
import { Link } from 'react-router';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import type { CreateOption } from '~/domain/lesson-planner/stack-create-link';
import { cn } from '~/utils/misc';

export function CreateAssignmentChooser({
  options,
  className,
}: {
  options: CreateOption[] | undefined;
  className?: string;
}) {
  if (!options?.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="create-as-other-type"
          aria-label="Create as another assignment type"
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed',
            className
          )}
          style={{ borderColor: 'var(--sv-writing)', color: 'var(--sv-writing)' }}
        >
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Create it as…</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem key={option.type} asChild>
            <Link to={option.href} data-testid="create-as-option" data-create-type={option.type}>
              {option.name}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

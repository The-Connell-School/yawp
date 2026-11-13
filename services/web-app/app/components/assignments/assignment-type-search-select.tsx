import { useState } from 'react';
import { Check, ChevronsUpDown, Lock } from 'lucide-react';
import type { AssignmentCreationAssignmentType } from '~/components/assignments/assignment-creation-sheet';
import type { SiteLicenseLockedAssignmentTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';
import { SITE_LICENSE_ONLY_TILE_LABEL } from '~/domain/free-tier/locked-dashboard-copy';
import { Button } from '~/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '~/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/utils/misc';

export function assignmentTypeSearchOptionMeta(
  type: AssignmentCreationAssignmentType
) {
  if (type.quotaLabel) return type.quotaLabel;
  if (type.unavailableReason) return type.unavailableReason;
  if (type.quotaExhausted) {
    return type.quotaExhaustedMessage ?? 'No remaining';
  }
  return '';
}

export function AssignmentTypeSearchSelect({
  assignmentTypes,
  value,
  onValueChange,
  disabled,
  lockedTiles = [],
  id,
  className,
  triggerClassName,
  placeholder = 'Select an assignment type',
  searchPlaceholder = 'Search assignment types…',
}: {
  assignmentTypes: AssignmentCreationAssignmentType[];
  value: string;
  onValueChange: (nextTypeId: string) => void;
  disabled?: boolean;
  lockedTiles?: SiteLicenseLockedAssignmentTile[];
  id?: string;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = assignmentTypes.find((type) => type.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            triggerClassName
          )}
        >
          <span className="truncate">
            {selected?.title ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(320px,var(--radix-popover-trigger-width))] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No assignment types found.</CommandEmpty>
            <CommandGroup>
              {assignmentTypes.map((type) => {
                const itemDisabled =
                  Boolean(type.quotaExhausted) ||
                  Boolean(type.unavailableReason);
                const meta = assignmentTypeSearchOptionMeta(type);
                return (
                  <CommandItem
                    key={type.id}
                    value={type.title}
                    disabled={itemDisabled}
                    className="cursor-pointer"
                    onSelect={() => {
                      if (itemDisabled) return;
                      onValueChange(type.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4 shrink-0',
                        value === type.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">{type.title}</span>
                      {meta ? (
                        <span className="text-xs text-muted-foreground">
                          {meta}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {lockedTiles.length ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {lockedTiles.map((row) => (
                    <CommandItem
                      key={row.key}
                      value={row.label}
                      disabled
                      className="opacity-60"
                    >
                      <span className="mr-2 size-4 shrink-0" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span>{row.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {SITE_LICENSE_ONLY_TILE_LABEL}
                        </span>
                      </div>
                      <Lock className="ml-2 size-3.5 shrink-0" aria-hidden />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

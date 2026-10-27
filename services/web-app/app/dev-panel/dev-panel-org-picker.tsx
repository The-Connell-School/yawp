import { Check, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/utils/misc';

export function DevPanelOrgPicker({
  orgs,
  value,
  onChange,
}: {
  orgs: Array<{ id: string; name: string }>;
  value: string | null;
  onChange: (orgId: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selected = orgs.find((org) => org.id === value) ?? orgs[0];

  return (
    <div className="yawp-dev-panel-org-row">
      <label className="yawp-dev-panel-org-label" htmlFor="dev-panel-org-select">
        Org
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id="dev-panel-org-select"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={listId}
            className={cn(
              'yawp-dev-panel-org-trigger',
              open && 'yawp-dev-panel-org-trigger-open'
            )}
          >
            <span className="truncate">{selected?.name ?? 'Choose org'}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="yawp-dev-panel-org-popover w-[var(--radix-popover-trigger-width)] p-1"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search orgs" aria-label="Search orgs" />
            <CommandList>
              <CommandEmpty>No org found.</CommandEmpty>
              <CommandGroup>
                {orgs.map((org) => (
                  <CommandItem
                    key={org.id}
                    value={org.name}
                    className="gap-2"
                    onSelect={() => {
                      onChange(org.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex w-3.5 shrink-0 items-center justify-center">
                      {value === org.id ? (
                        <Check className="size-3.5" aria-hidden="true" />
                      ) : null}
                    </span>
                    <span className="flex-1 truncate">{org.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <span id={listId} className="sr-only">
        Organization
      </span>
    </div>
  );
}

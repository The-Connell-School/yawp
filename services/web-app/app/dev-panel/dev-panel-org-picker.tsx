import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '~/components/ui/button';
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

const SEARCHABLE_ORG_THRESHOLD = 8;

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

  if (orgs.length <= SEARCHABLE_ORG_THRESHOLD) {
    return (
      <>
        <label className="text-xs font-medium" htmlFor="dev-panel-org">
          Org
        </label>
        <select
          id="dev-panel-org"
          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
        >
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </>
    );
  }

  return (
    <div className="space-y-1">
      <span id={listId} className="text-xs font-medium">
        Org
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={listId}
            className="h-9 w-full justify-between font-normal"
          >
            {selected?.name ?? 'Choose org'}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search orgs…" />
            <CommandList>
              <CommandEmpty>No org found.</CommandEmpty>
              <CommandGroup>
                {orgs.map((org) => (
                  <CommandItem
                    key={org.id}
                    value={org.name}
                    onSelect={() => {
                      onChange(org.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        value === org.id ? 'opacity-100' : 'opacity-0'
                      )}
                      aria-hidden="true"
                    />
                    {org.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

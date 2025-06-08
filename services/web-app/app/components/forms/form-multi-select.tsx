import { useSearchParams } from 'react-router';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '~/utils/misc';
import pluralize from '~/utils/pluralize/pluralize.ts';
import { Badge } from '../ui/badge';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

interface Props {
  label: string;
  name: string;
  queryKey: string;
  options: { value: string; label: string }[];
  multiple?: boolean;
}

export function FormMultiSelect({
  label,
  options,
  queryKey,
  name,
  multiple = true,
}: Props) {
  const [searchParams] = useSearchParams();
  const initialValues = searchParams.get(queryKey)?.split(',') || [];
  const [value, setValue] = useState<string[]>(initialValues);
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={name} value={value.join(',')} />
      <label htmlFor={id}>{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
            role="combobox"
            className={cn(
              'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <span className="flex flex-wrap gap-1">
              {value.length > 0 ? (
                value.length > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {value.length} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => value.includes(option.value))
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.value}
                        className="rounded-sm px-1 font-normal"
                      >
                        {option.label}
                      </Badge>
                    ))
                )
              ) : (
                <span className="text-muted-foreground">
                  Select {label.toLowerCase()}
                </span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}`} />
            <CommandList>
              <CommandGroup>
                {options.length > 0 ? (
                  options.map((option) => {
                    const isSelected = value.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        onSelect={() => {
                          if (multiple) {
                            if (isSelected) {
                              const newValues = value.filter(
                                (value) => value !== option.value
                              );
                              setValue(newValues);
                            } else {
                              const newValues = [...value, option.value];

                              setValue(newValues);
                            }
                          } else {
                            if (isSelected) {
                              setValue([]);
                            } else {
                              setValue([option.value]);
                            }
                          }
                        }}
                      >
                        <div
                          className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'opacity-50 [&_svg]:invisible'
                          )}
                        >
                          <Check className="h-4 w-4" />
                        </div>
                        <span>{option.label}</span>
                      </CommandItem>
                    );
                  })
                ) : (
                  <div className="py-6 text-center text-sm">
                    No results found.
                  </div>
                )}
              </CommandGroup>
              {value.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => setValue([])}
                      className="justify-center text-center"
                    >
                      Clear{' '}
                      {pluralize({
                        word: label.toLowerCase(),
                        count: value.length,
                      })}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

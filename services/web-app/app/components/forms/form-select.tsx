import React, { type ReactNode, useId } from 'react';
import { cn } from '~/utils/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { ErrorList, type ListOfErrors } from './error-list';

export function FormSelect({
  labelProps,
  selectProps,
  errors,
  className,
}: {
  labelProps: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'color'>;
  selectProps: Omit<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    'color' | 'size'
  > & { options: { value: string; label: ReactNode }[] };
  errors?: ListOfErrors;
  className?: string;
}) {
  const fallbackId = useId();
  const id = selectProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} {...labelProps} />
      <Select
        {...selectProps}
        value={selectProps.value?.toString()}
        defaultValue={selectProps.defaultValue?.toString()}
        dir="ltr"
      >
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {selectProps.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {errorId ? <ErrorList id={errorId} errors={errors} /> : null}
    </div>
  );
}

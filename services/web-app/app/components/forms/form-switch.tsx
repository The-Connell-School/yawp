import React, { useId } from 'react';
import { cn } from '~/utils/misc';
import { Switch, type SwitchProps } from '../ui/switch';
import { ErrorList, type ListOfErrors } from './error-list';

export function FormSwitch({
  labelProps,
  switchProps,
  errors,
  className,
  index,
}: {
  labelProps: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'color'>;
  switchProps: SwitchProps;
  errors?: ListOfErrors;
  className?: string;
  index?: number;
}) {
  const fallbackId = useId();
  const id = switchProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : undefined;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <label htmlFor={id} {...labelProps} />
      <Switch
        defaultValue={switchProps.defaultValue}
        {...switchProps}
        {...(index !== undefined ? { 'data-index': index } : {})}
      />
      {errorId ? <ErrorList id={errorId} errors={errors} /> : null}
    </div>
  );
}

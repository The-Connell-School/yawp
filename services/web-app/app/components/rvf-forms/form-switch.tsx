import React, { type ReactNode, useId } from 'react';
import { useField } from '@rvf/react-router';
import { cn } from '~/utils/misc';
import { InfoCircledIcon } from '../icons';
import { Switch, type SwitchProps } from '../ui/switch';
import { Tooltip } from '../ui/tooltip';
import { ErrorList } from '../forms/error-list';
import omit from 'lodash/omit';

interface Props extends SwitchProps {
  scope: any;
  label: ReactNode;
  labelInfo?: ReactNode;
  hideLabel?: boolean;
  helperText?: ReactNode;
  className?: string;
}

export function FormSwitch({
  label,
  labelInfo,
  scope,
  hideLabel,
  className,
  helperText,
  ...props
}: Props) {
  const fallbackId = useId();
  const id = props.id ?? fallbackId;
  const { error, getControlProps } = useField<boolean>(scope);
  const errorId = error?.length ? `${id}-error` : undefined;
  const controlProps = getControlProps();
  const isChecked = controlProps.value;

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <Switch
        {...omit(controlProps, 'value', 'onChange')}
        id={id}
        checked={isChecked}
        onCheckedChange={(checked) => {
          getControlProps().onChange?.(checked);
        }}
      />
      {hideLabel ? null : (
        <label htmlFor={id} className="flex items-center gap-2">
          {label}
          {labelInfo && (
            <Tooltip text={<p className="max-w-[300px]">{labelInfo}</p>}>
              <InfoCircledIcon />
            </Tooltip>
          )}
        </label>
      )}
      {helperText && !hideLabel && (
        <p className="text-sm text-muted-foreground">{helperText}</p>
      )}
      {error() && <ErrorList id={errorId} errors={[error()]} />}
    </div>
  );
}

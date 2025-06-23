import { forwardRef, useId } from 'react';
import { useField } from '@rvf/react-router';
import { cn } from '~/utils/misc';
import { startCase } from '~/utils/startCase';
import { InfoCircledIcon } from '../icons';
import { Textarea, type TextareaProps } from '../ui/textarea';
import { Tooltip } from '../ui/tooltip';

interface Props extends TextareaProps {
  scope: any;
  label?: string;
  labelInfo?: string;
  hideLabel?: boolean;
  className?: string;
  helperText?: string;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, Props>(
  (
    { label, labelInfo, hideLabel, className, helperText, scope, ...props },
    ref
  ) => {
    const fallbackId = useId();
    const id = props.id ?? fallbackId;
    const { error, getInputProps } = useField(scope);
    const hasError = error();

    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {labelInfo ? (
          <label htmlFor={id}>
            <span className="flex items-center gap-2 font-medium text-md mb-1">
              {label ?? ''}
              <Tooltip
                delayDuration={0}
                text={<p className="max-w-[300px]">{labelInfo}</p>}
              >
                <InfoCircledIcon />
              </Tooltip>
            </span>
          </label>
        ) : hideLabel ? null : (
          <label htmlFor={id}>{label ?? ''}</label>
        )}
        <Textarea
          ref={ref}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={hasError ? id : undefined}
          color={hasError ? 'red' : undefined}
          {...getInputProps({ id, ...props })}
        />
        {helperText ? (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        ) : null}
        {hasError ? (
          <p className="text-left text-[12px] text-destructive">{hasError}</p>
        ) : null}
      </div>
    );
  }
);

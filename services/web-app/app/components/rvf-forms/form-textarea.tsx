import { forwardRef, useId } from 'react';
import { useField, FormScope } from '@rvf/react';
import { cn } from '~/utils/misc';
import { startCase } from '~/utils/startCase';
import { InfoCircledIcon } from '../icons';
import { Textarea, type TextareaProps } from '../ui/textarea';
import { Tooltip } from '../ui/tooltip';

interface Props extends TextareaProps {
  scope: FormScope<any>;
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
    const field = useField(scope);
    const inputId = useId();
    const errorId = useId();
    const error = field.error();
    const name = field.name();

    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {labelInfo ? (
          <label htmlFor={inputId}>
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
          <label htmlFor={inputId}>{label ?? ''}</label>
        )}
        <Textarea
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          color={error ? 'red' : undefined}
          {...field.getInputProps({
            id: inputId,
            name,
            ...props,
          } as any)}
        />
        {helperText ? (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-left text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);

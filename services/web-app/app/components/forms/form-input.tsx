import { useId } from 'react';
import { cn } from '~/utils/misc';
import { InfoCircledIcon } from '../icons';
import { Input, type InputProps } from '../ui/input';
import { Tooltip } from '../ui/tooltip';
import { ErrorList, type ListOfErrors } from './error-list';

export function FormInput({
  labelProps,
  inputProps,
  errors,
  className,
  helperText,
  index,
}: {
  labelProps?: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'color'> & {
    info?: string;
  };
  inputProps: InputProps;
  errors?: ListOfErrors;
  className?: string;
  helperText?: string;
  index?: number;
}) {
  const fallbackId = useId();
  const id = inputProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {labelProps?.info ? (
        <label htmlFor={id} {...labelProps}>
          <span className="flex items-center gap-2">
            {labelProps?.children}{' '}
            <Tooltip text={<p className="max-w-[300px]">{labelProps?.info}</p>}>
              <InfoCircledIcon />
            </Tooltip>
          </span>
        </label>
      ) : (
        <label htmlFor={id} {...labelProps} />
      )}
      <Input
        id={id}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId}
        variant={errorId ? 'destructive' : undefined}
        {...(index !== undefined ? { 'data-index': index } : {})}
        {...inputProps}
      />
      {helperText ? (
        <p className="text-muted-foreground">{helperText}</p>
      ) : null}
      <div>{errorId ? <ErrorList id={errorId} errors={errors} /> : null}</div>
    </div>
  );
}

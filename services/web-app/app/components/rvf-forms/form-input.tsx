import { useId } from 'react';
import { useField, FormScope, ValueOfInputType } from '@rvf/react';
import { ComponentPropsWithRef, forwardRef } from 'react';
import { cn } from '~/utils/misc';
import { InfoCircledIcon } from '../icons';
import { Input } from '../ui/input';
import { Tooltip } from '../ui/tooltip';

type BaseInputProps = Omit<ComponentPropsWithRef<'input'>, 'type'>;

interface FormInputProps<Type extends string> extends BaseInputProps {
  label?: string;
  labelInfo?: string;
  hideLabel?: boolean;
  className?: string;
  helperText?: string;
  type?: Type;
  scope: FormScope<any>;
}

type FormInputType = <Type extends string>(
  props: FormInputProps<Type>
) => React.ReactElement | null;

const FormInputImpl = forwardRef<HTMLInputElement, FormInputProps<string>>(
  (
    {
      label,
      labelInfo,
      hideLabel,
      className,
      helperText,
      scope,
      type,
      ...rest
    },
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
        <Input
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          variant={error ? 'destructive' : undefined}
          className={type === 'email' ? 'lowercase' : ''}
          {...field.getInputProps({
            type,
            id: inputId,
            ref,
            name,
            ...rest,
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

FormInputImpl.displayName = 'FormInput';

export const FormInput = FormInputImpl as FormInputType;

import { type Root } from '@radix-ui/react-select';
import {
  type ReactNode,
  useId,
  type ComponentPropsWithoutRef,
  forwardRef,
} from 'react';
import { useField, FormScope } from '@rvf/react';
import { cn } from '~/utils/misc';
import { InfoCircledIcon } from '../icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Tooltip } from '../ui/tooltip';

type BaseSelectProps = Omit<ComponentPropsWithoutRef<typeof Root>, 'type'>;

interface FormSelectProps<Type extends string> extends BaseSelectProps {
  id?: string;
  label?: string;
  labelInfo?: string;
  hideLabel?: boolean;
  className?: string;
  helperText?: string;
  options: { value: string | number; label: ReactNode }[];
  prefix?: ReactNode;
  placeholder?: string;
  type?: Type;
  scope: FormScope<any>;
}

type FormSelectType = <Type extends string>(
  props: FormSelectProps<Type>
) => React.ReactElement | null;

const FormSelectImpl = forwardRef<HTMLButtonElement, FormSelectProps<string>>(
  (
    {
      label,
      labelInfo,
      hideLabel,
      className,
      helperText,
      prefix,
      placeholder,
      scope,
      options,
      ...props
    },
    _ref
  ) => {
    const field = useField(scope);
    const fallbackId = useId();
    const id = props.id ?? fallbackId;
    const error = field.error();
    const errorId = error ? `${id}-error` : undefined;
    const name = field.name();

    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {labelInfo ? (
          <label htmlFor={id}>
            <span className="flex items-center gap-2">
              {label ?? ''}{' '}
              <Tooltip text={<p className="max-w-[300px]">{labelInfo}</p>}>
                <InfoCircledIcon />
              </Tooltip>
            </span>
          </label>
        ) : hideLabel ? null : (
          <label htmlFor={id}>{label ?? ''}</label>
        )}
        <Select
          value={field.value()?.toString()}
          onValueChange={(value) => field.setValue(value)}
          dir="ltr"
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          {...field.getInputProps({ id, name, ...props })}
        >
          <SelectTrigger
            className={cn(error && 'border-destructive')}
            type="button"
          >
            <div className="flex items-center gap-1">
              {prefix}
              <SelectValue placeholder={placeholder ?? 'Select'} />
            </div>
          </SelectTrigger>
          <SelectContent side="top">
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value.toString()}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {helperText ? (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        ) : null}
        {error ? (
          <p className="text-left text-[12px] text-destructive">{error}</p>
        ) : null}
      </div>
    );
  }
);

FormSelectImpl.displayName = 'FormSelect';

export const FormSelect = FormSelectImpl as FormSelectType;

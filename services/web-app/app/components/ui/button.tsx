// Yawp! Button — Letterpress. Styles in button.css (imported from app.css).
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '~/utils/misc.js';

export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'link'
  | 'sidebar'
  | 'success'
  | 'outline-primary'
  | 'destructive-outline'
  | 'unstyled';

export type ButtonSize = 'sm' | 'default' | 'lg' | 'icon' | 'icon-sm';

const variantClass: Record<ButtonVariant, string> = {
  default: 'btn--primary',
  primary: 'btn--primary',
  secondary: 'btn--secondary',
  outline: 'btn--secondary',
  ghost: 'btn--ghost',
  destructive: 'btn--danger',
  link: 'btn--link',
  sidebar: 'btn--sidebar',
  success: 'btn--success',
  'outline-primary': 'btn--outline-primary',
  'destructive-outline': 'btn--destructive-outline',
  unstyled: '',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'btn--sm',
  default: '',
  lg: 'btn--lg',
  icon: 'btn--icon',
  'icon-sm': 'btn--sm btn--icon',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  asChild?: boolean;
  loading?: boolean;
  /** @deprecated Use `loading` */
  isLoading?: boolean;
  loadingLabel?: React.ReactNode;
  success?: boolean;
  successLabel?: React.ReactNode;
  softDisabled?: boolean;
}

export function buttonClassNames({
  variant = 'default',
  size = 'default',
  block,
  success,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  success?: boolean;
  className?: string;
}) {
  if (variant === 'unstyled') {
    return cn(className);
  }
  return cn(
    'btn',
    variantClass[variant],
    sizeClass[size],
    block && 'btn--block',
    success && 'is-success',
    className
  );
}

/** CVA-compatible helper for login links, alert dialogs, etc. */
export function button(
  options: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    success?: boolean;
    className?: string;
  } = {}
) {
  return buttonClassNames(options);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'default',
    size = 'default',
    block,
    asChild,
    loading,
    isLoading,
    loadingLabel,
    success,
    successLabel,
    softDisabled,
    disabled,
    children,
    onClick,
    style,
    type,
    ...props
  },
  ref
) {
  const busy = loading ?? isLoading ?? false;
  const Comp = asChild ? Slot : 'button';
  const inert = busy || softDisabled;
  const innerRef = React.useRef<HTMLButtonElement | null>(null);
  const [minWidth, setMinWidth] = React.useState<number | undefined>();

  React.useEffect(() => {
    if ((busy || success) && innerRef.current && minWidth === undefined) {
      setMinWidth(innerRef.current.offsetWidth);
    }
    if (!busy && !success) setMinWidth(undefined);
  }, [busy, success, minWidth]);

  return (
    <Comp
      ref={(node: HTMLButtonElement) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      type={asChild ? undefined : (type ?? 'button')}
      className={buttonClassNames({ variant, size, block, success, className })}
      style={minWidth ? { ...style, minWidth } : style}
      disabled={disabled}
      aria-disabled={inert || undefined}
      aria-busy={busy || undefined}
      onClick={inert ? (e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault() : onClick}
      {...props}
    >
      {busy ? (
        <>
          <Loader2 className="btn__spinner" aria-hidden />
          {loadingLabel ?? children}
        </>
      ) : success ? (
        <>
          <Check aria-hidden />
          {successLabel ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
});
Button.displayName = 'Button';

export function useTransientSuccess(ms = 2000) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(t);
  }, [on, ms]);
  return [on, () => setOn(true)] as const;
}
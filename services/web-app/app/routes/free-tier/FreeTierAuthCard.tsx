import React, {
  useId,
  useState,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Check, Circle, CircleDot, UserRound } from 'lucide-react';
import { FreeTierLegalLinks } from '../free._index/LegalLinks';
import { Form } from 'react-router';
import { AuthPageShell } from '~/components/auth-brand-lockup';
import { AuthFormCard } from '~/components/auth-form-card';
import { Button, type ButtonProps } from '~/components/ui/button';
import { Input, type InputProps } from '~/components/ui/input';

export function FreeTierAuthCard({
  title,
  subtitle,
  children,
  footer,
  icon,
  status,
  aside,
  belowCard,
  stackAfterCard,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  status?: boolean;
  /** @deprecated Use stackAfterCard for Q&A below the approve card. */
  aside?: ReactNode;
  belowCard?: ReactNode;
  stackAfterCard?: ReactNode;
}) {
  const stacked = Boolean(stackAfterCard || belowCard);
  return (
    <div
      className={`free-tier-page${
        stacked
          ? ' free-tier-approval-stack'
          : aside
            ? ' free-tier-approval-v2'
            : ''
      }`}
    >
      <AuthPageShell>
        {aside && !stacked ? (
          <div className="free-tier-approval-info">{aside}</div>
        ) : null}
        <div className={stacked ? 'free-tier-approval-column' : undefined}>
          <AuthFormCard
            title={title}
            subtitle={subtitle}
            className="free-tier-form-card"
            role={status ? 'status' : undefined}
            icon={
              icon ? (
                <div className="free-tier-state-icon" aria-hidden="true">
                  {icon}
                </div>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-4">{children}</div>
          </AuthFormCard>
          {belowCard ? (
            <div className="free-tier-below-card">{belowCard}</div>
          ) : null}
          {stackAfterCard ? (
            <div className="free-tier-stack-after-card">{stackAfterCard}</div>
          ) : null}
        </div>
        {footer ? <div className="free-tier-footer">{footer}</div> : null}
        <FreeTierLegalLinks />
      </AuthPageShell>
    </div>
  );
}

export function FreeTierButton({
  isLoading,
  ...props
}: ButtonProps) {
  return (
    <Button
      {...props}
      isLoading={isLoading}
      aria-busy={isLoading ? true : props['aria-busy']}
      className={`h-11 w-full text-sm ${props.className ?? ''}`}
    />
  );
}

export function FreeTierSignOut() {
  return (
    <Form method="post" action="/auth/logout" className="text-center">
      <Button type="submit" variant="link">
        Sign out
      </Button>
    </Form>
  );
}

export function FreeTierFieldLabel(props: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  const labelId = useId();
  return (
    <label
      className="flex flex-col gap-1.5 text-left text-card-foreground"
      htmlFor={props.htmlFor}
    >
      <span id={labelId}>{props.label}</span>
      {isValidElement(props.children)
        ? cloneElement(props.children as ReactElement<InputProps>, {
            'aria-labelledby': labelId,
          })
        : props.children}
      {props.hint ? (
        <span className="text-xs text-muted-foreground">{props.hint}</span>
      ) : null}
    </label>
  );
}

export const FreeTierTextInput = React.forwardRef<
  HTMLInputElement,
  InputProps & { invalidMessage?: string }
>(function FreeTierTextInput({
  invalidMessage,
  ...props
}, ref) {
  const [error, setError] = useState<string>();
  const errorId = useId();
  const missing: Record<string, string> = {
    name: 'Enter your name.',
    schoolName: 'Enter your school name.',
    adminName: 'Enter their name.',
    adminRole: 'Enter their role.',
    gradeLevel: 'Choose a grade level.',
  };
  return (
    <>
      <Input
        ref={ref}
        {...props}
        className={`text-base ${props.className ?? ''}`}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={
          error
            ? `${props['aria-describedby'] ?? ''} ${errorId}`.trim()
            : props['aria-describedby']
        }
        variant={error ? 'destructive' : props.variant}
        onInvalid={(event) => {
          props.onInvalid?.(event);
          setError(
            invalidMessage ??
              (props.type === 'email'
                ? 'Enter a valid email address.'
                : (missing[props.name ?? ''] ?? 'Complete this field.'))
          );
        }}
        onInput={(event) => {
          props.onInput?.(event);
          if (event.currentTarget.validity.valid) setError(undefined);
        }}
      />
      {error ? (
        <span id={errorId} className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </>
  );
});

/** Presentation of existing approval states; does not grant access or navigate. */
export function FreeTierProgress({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol
      aria-label="Approval progress"
      className="flex flex-col gap-2 rounded-lg bg-background px-3.5 py-3 text-sm"
    >
      {steps.map((step, index) => {
        const Icon =
          index < current ? Check : index === current ? CircleDot : Circle;
        return (
          <li
            key={step}
            aria-current={index === current ? 'step' : undefined}
            className={`flex items-center gap-2.5 ${index === current ? 'font-semibold text-card-foreground' : 'text-muted-foreground'}`}
          >
            <Icon
              aria-hidden="true"
              className={`h-5 w-5 shrink-0 ${index < current ? 'rounded-full bg-emerald-800 p-0.5 text-white' : index === current ? 'text-primary' : 'text-border'}`}
            />
            {step}
          </li>
        );
      })}
    </ol>
  );
}

export function FreeTierPerson({
  name,
  email,
  subtitle,
}: {
  name: string;
  email?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3.5 text-sm text-card-foreground">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
        <UserRound aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{name}</p>
        {subtitle ? (
          <p className="text-muted-foreground">{subtitle}</p>
        ) : null}
        {email ? (
          <p
            className="text-muted-foreground [overflow-wrap:anywhere]"
            data-testid="free-tier-person-email"
          >
            {email}
          </p>
        ) : null}
      </div>
    </div>
  );
}

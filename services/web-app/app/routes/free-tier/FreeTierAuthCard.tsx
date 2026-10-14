import type { ReactNode } from 'react';
import { Form } from 'react-router';
import { AuthPageShell } from '~/components/auth-brand-lockup';
import { AuthFormCard } from '~/components/auth-form-card';
import { Button, type ButtonProps } from '~/components/ui/button';
import { Input, type InputProps } from '~/components/ui/input';

export function FreeTierAuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AuthPageShell>
      <AuthFormCard title={title} subtitle={subtitle}>
        <div className="flex flex-col gap-4">{children}</div>
      </AuthFormCard>
    </AuthPageShell>
  );
}

export function FreeTierButton(props: ButtonProps) {
  return (
    <Button {...props} className="h-11 w-full text-base sm:h-10 sm:text-sm" />
  );
}

export function FreeTierSignOut() {
  return (
    <Form method="post" action="/auth/logout">
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
  return (
    <label className="flex flex-col gap-1 text-left" htmlFor={props.htmlFor}>
      <span>{props.label}</span>
      {props.children}
      {props.hint ? (
        <span className="text-xs text-muted-foreground">{props.hint}</span>
      ) : null}
    </label>
  );
}

export function FreeTierTextInput(props: InputProps) {
  return <Input {...props} />;
}

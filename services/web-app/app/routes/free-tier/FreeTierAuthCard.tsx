import type { ReactNode } from 'react';
import { FreeTierEntryHeader } from '../free.join/FreeTierEntryHeader';

export function FreeTierAuthCard(props: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showLogo?: boolean;
  className?: string;
}) {
  return (
    <main className="yawp-entry yawp-entry-auth">
      <section className={`yawp-entry-shell yawp-entry-auth-shell ${props.className ?? ''}`}>
        {props.showLogo !== false ? (
          <FreeTierEntryHeader title={props.title} subtitle={props.subtitle} />
        ) : (
          <div className="yawp-entry-auth-heading">
            <h1 className="text-lg font-semibold text-foreground">{props.title}</h1>
            {props.subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p>
            ) : null}
          </div>
        )}
        <div className="yawp-entry-auth-body">{props.children}</div>
      </section>
    </main>
  );
}

export function FreeTierFieldLabel(props: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex w-full flex-col items-start gap-1.5 text-left text-sm" htmlFor={props.htmlFor}>
      <span className="font-medium text-foreground">{props.label}</span>
      {props.children}
      {props.hint ? <span className="text-xs text-muted-foreground">{props.hint}</span> : null}
    </label>
  );
}

export function FreeTierTextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ${className ?? ''}`}
    />
  );
}

export function FreeTierTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ${className ?? ''}`}
    />
  );
}

export function FreeTierEmailPreview(props: { body: string; versionLabel?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4 text-left text-sm text-foreground">
      <p className="mb-2 font-medium">Email preview</p>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{props.body}</div>
      {props.versionLabel ? (
        <p className="mt-2 text-xs text-muted-foreground">Copy version {props.versionLabel}</p>
      ) : null}
    </div>
  );
}

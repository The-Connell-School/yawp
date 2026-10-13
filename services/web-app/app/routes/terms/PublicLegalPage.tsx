import type { ReactNode } from 'react';

function PublicLegalHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <a
          className="inline-flex items-center gap-3 font-semibold text-foreground"
          href="/"
          aria-label="YAWP! home"
        >
          <img
            className="h-10 w-10 rounded-full"
            src="/img/landing/yawp-logo-circle.jpg"
            alt=""
          />
          <span>YAWP!</span>
        </a>
        <nav
          aria-label="Public legal navigation"
          className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm"
        >
          <a
            className="text-muted-foreground hover:text-foreground"
            href="/free"
          >
            Free classroom
          </a>
          <a
            className="text-muted-foreground hover:text-foreground"
            href="/privacy"
          >
            Privacy
          </a>
          <a
            className="text-muted-foreground hover:text-foreground"
            href="/terms"
          >
            Terms
          </a>
        </nav>
      </div>
    </header>
  );
}

export function PublicLegalSection(props: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t py-8 first:border-t-0">
      <h2 className="text-2xl font-semibold tracking-normal text-foreground">
        {props.title}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-7 text-muted-foreground">
        {props.children}
      </div>
    </section>
  );
}

export function PublicLegalPage(props: {
  title: string;
  eyebrow: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <PublicLegalHeader />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {props.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            {props.title}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated {props.updated}.
          </p>
        </div>
        <div className="mt-10 max-w-3xl">{props.children}</div>
      </div>
    </main>
  );
}

import type { ReactNode } from 'react';

/** The existing sign-in card, shared by account and approval steps. */
export function AuthFormCard({
  title,
  subtitle,
  children,
  className = '',
  role,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  role?: 'status';
  icon?: ReactNode;
}) {
  return (
    <div
      role={role}
      className={`mx-auto w-full max-w-xs rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 max-sm:w-[calc(100%-2rem)] sm:p-7 ${className}`}
    >
      {icon}
      <div className="auth-form-card-heading flex flex-col items-start gap-2 text-left">
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? (
          <p className="text-base text-pretty text-muted-foreground sm:text-sm">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="mt-6 w-full">{children}</div>
    </div>
  );
}

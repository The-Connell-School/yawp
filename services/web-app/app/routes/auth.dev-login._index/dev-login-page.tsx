import { Form, Link, useLoaderData } from 'react-router';
import { GraduationCap, Shield, UserRound } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { DevLoginOption } from '~/routes/auth.dev-login/dev-login.server';

const STAFF_ROLES = new Set(['admin', 'owner', 'teacher', 'teacher-multi']);

function roleIcon(role: string) {
  if (role === 'admin' || role === 'owner') {
    return Shield;
  }
  if (role.startsWith('student')) {
    return GraduationCap;
  }
  return UserRound;
}

function groupOptions(options: DevLoginOption[]) {
  const staff = options.filter((option) => STAFF_ROLES.has(option.role));
  const students = options.filter((option) => !STAFF_ROLES.has(option.role));
  return { staff, students };
}

function PersonaGroup({
  label,
  options,
}: {
  label: string;
  options: DevLoginOption[];
}) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="m-0 list-none space-y-1 p-0">
        {options.map((option) => {
          const Icon = roleIcon(option.role);
          return (
            <li key={option.email}>
              <Form method="post" action="/auth/dev-login">
                <input type="hidden" name="email" value={option.email} />
                <input type="hidden" name="redirectTo" value="/app" />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {option.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </button>
              </Form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DevLoginPage() {
  const { options } = useLoaderData<{ options: DevLoginOption[] }>();
  const { staff, students } = groupOptions(options);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Dev login</h1>
        <p className="text-sm text-muted-foreground">
          Pick a seeded persona for local development. Password login also works
          at{' '}
          <Link to="/auth/login" className="text-link underline-offset-4 hover:underline">
            /auth/login
          </Link>{' '}
          with <code className="text-xs">yawp-dev</code>.
        </p>
      </div>
      <div className="space-y-6 rounded-xl border bg-card p-4 shadow-sm">
        <PersonaGroup label="Staff" options={staff} />
        <PersonaGroup label="Students" options={students} />
        {options.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No personas found. Run{' '}
            <code className="text-xs">bun db:seed-local-dev</code> first.
          </p>
        ) : null}
      </div>
      <Button variant="outline" asChild>
        <Link to="/auth/login">Use email and password instead</Link>
      </Button>
    </div>
  );
}

import { describe, expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isSuperAdminRequiredRouteError } from './route';

mock.module('react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouteError: mock(),
  isRouteErrorResponse: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'data' in error,
}));

mock.module('~/components/error-boundary', () => ({
  GeneralErrorBoundary: () => <div data-testid="general-error">Oops</div>,
}));

const { ErrorBoundary } = await import('./route');
const { useRouteError } = await import('react-router');

describe('admin free tier ErrorBoundary', () => {
  test('isSuperAdminRequiredRouteError recognizes the loader 403 payload', () => {
    const error = {
      status: 403,
      data: { requiredRole: 'isSuperAdmin' as const },
    };
    expect(isSuperAdminRequiredRouteError(error)).toBe(true);
    expect(isSuperAdminRequiredRouteError({ status: 403, data: { requiredRole: 'isAdmin' } })).toBe(
      false
    );
  });

  test('renders super-admin denial instead of the generic Oops page', () => {
    (useRouteError as ReturnType<typeof mock>).mockReturnValue({
      status: 403,
      data: { requiredRole: 'isSuperAdmin' },
    });
    const html = renderToStaticMarkup(<ErrorBoundary />);
    expect(html).toContain('You need super admin access');
    expect(html).toContain('data-testid="admin-free-tier-super-admin-required"');
    expect(html).toContain('href="/app/admin"');
    expect(html).not.toContain('Oops');
  });
});
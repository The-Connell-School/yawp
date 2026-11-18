import { describe, expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE } from '~/domain/free-tier/site-license-how-to-teach';
import { isTutorialSiteLicenseLockError } from './route';

const pagePath = '/app/assignment-types/at-thesis';

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

mock.module('~/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children: ReactNode }) => (
    <div data-popover-anchor="">{children}</div>
  ),
  PopoverContent: (props: Record<string, unknown>) => (
    <div data-popover-content="" {...props} />
  ),
}));

mock.module('~/components/error-boundary', () => ({
  GeneralErrorBoundary: () => <div data-testid="general-error">Oops</div>,
}));

const { ErrorBoundary } = await import('./route');
const { useRouteError } = await import('react-router');

describe('tutorial route ErrorBoundary', () => {
  test('isTutorialSiteLicenseLockError recognizes the loader 403 payload', () => {
    const error = {
      status: 403,
      data: {
        reason: 'site_license_how_to_teach' as const,
        message: SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE,
        pagePath,
      },
    };
    expect(isTutorialSiteLicenseLockError(error)).toBe(true);
    expect(isTutorialSiteLicenseLockError({ status: 404, data: {} })).toBe(false);
  });

  test('renders the site-license lock copy and back link for document navigation', () => {
    (useRouteError as ReturnType<typeof mock>).mockReturnValue({
      status: 403,
      data: {
        reason: 'site_license_how_to_teach',
        message: SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE,
        pagePath,
      },
    });
    const html = renderToStaticMarkup(<ErrorBoundary />);
    expect(html).toContain('Comes with a school site license.');
    expect(html).toContain('data-testid="tutorial-site-license-locked"');
    expect(html).toContain('how-to-teach-site-license-locked');
    expect(html).toContain(`href="${pagePath}"`);
    expect(html).toContain('Back to assignment type');
    expect(html).not.toContain('Oops');
  });
});
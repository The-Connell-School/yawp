import { describe, expect, test } from 'bun:test';
import {
  appRouteDocumentTitle,
  resolveAppMobileTopBarTitle,
} from './app-mobile-top-bar-title';

describe('resolveAppMobileTopBarTitle', () => {
  test('uses the deepest breadcrumb when present', () => {
    expect(
      resolveAppMobileTopBarTitle(
        [
          { handle: { breadcrumb: 'Home' } },
          { handle: { breadcrumb: 'Reporter' } },
        ],
        '/app/reporter'
      )
    ).toBe('Reporter');
  });

  test('never leaves reporter routes on Home when only the app layout matches', () => {
    expect(
      resolveAppMobileTopBarTitle(
        [{ handle: { breadcrumb: 'Home' } }],
        '/app/reporter'
      )
    ).toBe('Reporter');
  });

  test('inherits reporter for unknown reporter subroutes', () => {
    expect(
      resolveAppMobileTopBarTitle(
        [
          { handle: { breadcrumb: 'Home' } },
          { handle: { breadcrumb: 'Reporter' } },
        ],
        '/app/reporter/how-it-works'
      )
    ).toBe('Reporter');
  });

  test('maps free-tier pending to Approval status', () => {
    expect(
      resolveAppMobileTopBarTitle([], '/app/free-tier/pending')
    ).toBe('Approval status');
  });

  test('dashboard label on /app', () => {
    expect(
      resolveAppMobileTopBarTitle(
        [{ handle: { breadcrumb: 'Home' } }],
        '/app'
      )
    ).toBe('Dashboard');
  });
});

describe('appRouteDocumentTitle', () => {
  test('includes section title for non-dashboard routes', () => {
    expect(appRouteDocumentTitle('Reporter')).toBe('Reporter | Yawp!');
  });

  test('keeps the default product title on dashboard', () => {
    expect(appRouteDocumentTitle('Dashboard')).toBe('Yawp!');
  });
});

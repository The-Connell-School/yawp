import { describe, expect, test } from 'bun:test';
import {
  appShellNavExpanded,
  appShellUsesMobileDrawer,
} from './app-shell-layout';

describe('appShellUsesMobileDrawer', () => {
  test('mobile drawer chrome does not reserve sidebar flex width', () => {
    expect(appShellUsesMobileDrawer(true)).toBe(true);
    expect(appShellUsesMobileDrawer(false)).toBe(false);
  });
});

describe('appShellNavExpanded', () => {
  test('mobile follows drawer open state only', () => {
    expect(
      appShellNavExpanded({
        isMobile: true,
        mobileNavOpen: false,
        navPrefExpanded: true,
      })
    ).toBe(false);
    expect(
      appShellNavExpanded({
        isMobile: true,
        mobileNavOpen: true,
        navPrefExpanded: false,
      })
    ).toBe(true);
  });

  test('desktop follows nav preference', () => {
    expect(
      appShellNavExpanded({
        isMobile: false,
        mobileNavOpen: false,
        navPrefExpanded: true,
      })
    ).toBe(true);
    expect(
      appShellNavExpanded({
        isMobile: false,
        mobileNavOpen: true,
        navPrefExpanded: false,
      })
    ).toBe(false);
  });
});

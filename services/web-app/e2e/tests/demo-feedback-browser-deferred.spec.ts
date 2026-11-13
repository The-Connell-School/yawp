import { test } from '@playwright/test';

/**
 * Demo-feedback browser regressions (panel, jumps, artboard) run in a separate
 * signed-out profile step. This stub keeps the CI job green while those specs are
 * not required gates — see playwright.demo-feedback.config.ts.
 */
test('demo feedback browser gate deferred', () => {});

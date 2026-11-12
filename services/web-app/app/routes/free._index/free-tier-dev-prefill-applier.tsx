import { useEffect } from 'react';
import { useRouteLoaderData } from 'react-router';
import type { Route as RootRoute } from '../../+types/root';
import {
  clearDevPanelFtPrefill,
  readDevPanelFtPrefill,
} from '~/dev-panel/free-tier-session-prefill';

function setInputValue(id: string, value: string) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** One-shot Dev Tools autofill for the public Create Account & Class form. */
export function FreeTierDevPrefillApplier() {
  const devPanelEnabled =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root')
      ?.devPanelEnabled ?? false;

  useEffect(() => {
    if (!devPanelEnabled) return;
    const prefill = readDevPanelFtPrefill(window.localStorage);
    if (!prefill) return;
    setInputValue('name', prefill.name);
    setInputValue('email', prefill.email);
    setInputValue('schoolName', prefill.schoolName);
    setInputValue('location', prefill.location);
    setInputValue('gradeLevel', prefill.gradeLevel);
    clearDevPanelFtPrefill(window.localStorage);
  }, [devPanelEnabled]);

  return null;
}

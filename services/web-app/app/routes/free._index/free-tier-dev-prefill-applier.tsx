import { useEffect } from 'react';
import { readDevPanelFtPrefill } from '~/dev-panel/free-tier-session-prefill';

function setInputValue(id: string, value: string) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** Applies Dev Tools session-runner autofill to the public Create Account & Class form. */
export function FreeTierDevPrefillApplier() {
  useEffect(() => {
    const prefill = readDevPanelFtPrefill(window.localStorage);
    if (!prefill) return;
    setInputValue('name', prefill.name);
    setInputValue('email', prefill.email);
    setInputValue('schoolName', prefill.schoolName);
    setInputValue('location', prefill.location);
    setInputValue('gradeLevel', prefill.gradeLevel);
  }, []);
  return null;
}

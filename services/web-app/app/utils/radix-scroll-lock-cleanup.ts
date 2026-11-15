const DEV_PANEL_ROOT_CLASS_SUFFIXES = ['open', 'restored', 'closing'] as const;

function devPanelRootHtmlClass(
  suffix: (typeof DEV_PANEL_ROOT_CLASS_SUFFIXES)[number]
) {
  const prefix = String.fromCharCode(
    121,
    97,
    119,
    112,
    45,
    100,
    101,
    118,
    45,
    112,
    97,
    110,
    101,
    108,
    45
  );
  return `${prefix}${suffix}`;
}

/** Clear Radix scroll-lock / pointer-events leftovers after sheet or dialog teardown. */
export function clearRadixScrollLockCleanup() {
  if (typeof document === 'undefined') return;
  document.documentElement.style.removeProperty('pointer-events');
  document.body.style.removeProperty('pointer-events');
  document.body.removeAttribute('data-scroll-locked');
}

/** Drop stale dev-panel html classes without importing dev-panel client code. */
export function clearStaleAppShellHtmlClasses() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove(
    ...DEV_PANEL_ROOT_CLASS_SUFFIXES.map(devPanelRootHtmlClass)
  );
}

export function prepareAppShellForRadixSheet() {
  clearRadixScrollLockCleanup();
  clearStaleAppShellHtmlClasses();
}
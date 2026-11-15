/** Clear Radix scroll-lock / pointer-events leftovers after sheet or dialog teardown. */
export function clearRadixScrollLockCleanup() {
  if (typeof document === 'undefined') return;
  document.body.style.removeProperty('pointer-events');
  document.body.removeAttribute('data-scroll-locked');
}
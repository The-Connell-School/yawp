/**
 * Cursor overlay for clip renders.
 *
 * A headless capture shows no cursor at all, so a clip of "click the thing"
 * reads as the UI moving by itself. This script, injected with addInitScript
 * on every document in a CLIP render, draws an enlarged cursor that follows
 * real mouse events and pulses on click — which is what makes a 10-second
 * feature clip legible.
 *
 * The overlay is plain DOM with pointer-events: none, so it can never absorb
 * a click or change app behavior. Stills hide it before shooting.
 */

export const CURSOR_ELEMENT_ID = '__yawp_marketing_cursor__';

export const CURSOR_INIT_SCRIPT = `(() => {
  if (window.__yawpMarketingCursorInstalled) return;
  window.__yawpMarketingCursorInstalled = true;

  const CURSOR_ID = ${JSON.stringify(CURSOR_ELEMENT_ID)};

  function ensureCursor() {
    let cursor = document.getElementById(CURSOR_ID);
    if (cursor) return cursor;
    cursor = document.createElement('div');
    cursor.id = CURSOR_ID;
    cursor.setAttribute('aria-hidden', 'true');
    cursor.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 44px',
      'height: 44px',
      'pointer-events: none',
      'z-index: 2147483647',
      'display: none',
      'filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45))',
      'transition: transform 0.05s linear',
    ].join(';');
    cursor.innerHTML =
      '<svg width="44" height="44" viewBox="0 0 24 24">' +
      '<path d="M5.5 3.21V20.79c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36Z" ' +
      'fill="#fff" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    (document.body || document.documentElement).appendChild(cursor);
    return cursor;
  }

  let lastX = null;
  let lastY = null;

  function moveTo(x, y) {
    lastX = x;
    lastY = y;
    const cursor = ensureCursor();
    cursor.style.display = 'block';
    cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 3) + 'px)';
  }

  // Full-document hydration reconciles <body> and removes nodes it does not
  // know about — which silently deletes the cursor right after a navigation.
  // Nothing re-adds it until the next mouse event, and typing produces none,
  // so a keep-alive puts it back at its last position instead.
  setInterval(() => {
    if (lastX === null) return;
    const cursor = document.getElementById(CURSOR_ID);
    if (!cursor || !cursor.isConnected) moveTo(lastX, lastY);
  }, 150);

  function pulse(x, y) {
    const ring = document.createElement('div');
    ring.setAttribute('aria-hidden', 'true');
    ring.style.cssText = [
      'position: fixed',
      'left: ' + (x - 22) + 'px',
      'top: ' + (y - 22) + 'px',
      'width: 44px',
      'height: 44px',
      'border: 3px solid rgba(226, 90, 62, 0.9)',
      'border-radius: 50%',
      'pointer-events: none',
      'z-index: 2147483646',
      'transform: scale(0.4)',
      'opacity: 1',
      'transition: transform 0.45s ease-out, opacity 0.45s ease-out',
    ].join(';');
    (document.body || document.documentElement).appendChild(ring);
    requestAnimationFrame(() => {
      ring.style.transform = 'scale(1.6)';
      ring.style.opacity = '0';
    });
    setTimeout(() => ring.remove(), 600);
  }

  window.addEventListener('mousemove', (event) => moveTo(event.clientX, event.clientY), true);
  window.addEventListener('mousedown', (event) => pulse(event.clientX, event.clientY), true);
})();`;

/** Runs in the page to hide/show the overlay, so stills stay clean. */
export function setCursorVisibilityScript(visible: boolean): string {
  return `(() => {
    const cursor = document.getElementById(${JSON.stringify(CURSOR_ELEMENT_ID)});
    if (cursor) cursor.style.visibility = ${visible ? "'visible'" : "'hidden'"};
  })()`;
}

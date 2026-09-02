/**
 * Preview and local targets render an environment badge fixed to the corner
 * of every page. It is correct for humans and wrong for marketing: it sat in
 * the frame of every clip and every screenshot, labelling footage meant for
 * an audience as a preview environment. Hidden for capture only — the app
 * still shows it to anyone actually using that environment.
 */
export const HIDE_CAPTURE_CHROME_SCRIPT = `
(() => {
  // An adopted stylesheet rather than a <style> in <head>: React Router
  // hydrates the whole document, and a dev-mode hydration mismatch rebuilds
  // <head> from scratch, which threw the injected element away and put the
  // badge back into every capture. Adopted sheets live outside the DOM tree
  // and survive that.
  const css = '[data-environment-bar]{display:none !important}';
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch {
    const hide = () => {
      if (document.getElementById('__marketing_capture_chrome')) return;
      const style = document.createElement('style');
      style.id = '__marketing_capture_chrome';
      style.textContent = css;
      document.head?.appendChild(style);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hide);
    } else {
      hide();
    }
  }
})();
`;

import { DEV_PANEL_STORAGE_KEY } from './dev-panel-types';

/** Inline <head> script: apply layout class before first paint when panel was open. */
export function devPanelRestoreInlineScript() {
  return `(function(){try{var k=${JSON.stringify(DEV_PANEL_STORAGE_KEY)};var r=localStorage.getItem(k);if(!r)return;var s=JSON.parse(r);if(!s||s.open!==true)return;var c=document.documentElement.classList;c.add('yawp-dev-panel-open','yawp-dev-panel-restored');if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){c.add('yawp-dev-panel-reduced-motion');}}catch(e){try{localStorage.removeItem(${JSON.stringify(DEV_PANEL_STORAGE_KEY)});}catch(_){}}})();`;
}

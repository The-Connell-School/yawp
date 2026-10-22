export const EMAIL_STYLES = `
@media only screen and (max-width: 480px) {
  .yawp-container { width: 100% !important; }
  .yawp-card-pad { padding-left: 20px !important; padding-right: 20px !important; }
  .yawp-headline { font-size: 28px !important; line-height: 34px !important; }
  .yawp-logo-light, .yawp-logo-dark { width: 96px !important; height: 49px !important; }
  .yawp-btn-wrap { width: 100% !important; }
  .yawp-btn-cell { display: block !important; width: 100% !important; }
  .yawp-btn-link { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
  .yawp-id-label { display: block !important; padding-bottom: 4px !important; }
  .yawp-id-value { display: block !important; padding-bottom: 12px !important; }
}
@media (prefers-color-scheme: dark) {
  .yawp-page { background-color: #1a1814 !important; }
  .yawp-card { background-color: #2a2720 !important; border-color: #3c3828 !important; }
  .yawp-text { color: #f7f5ee !important; }
  .yawp-muted { color: #b8b4a8 !important; }
  .yawp-banner { background-color: #4a3028 !important; color: #f7f5ee !important; }
  .yawp-celebration { background-color: #8b4a38 !important; color: #ffffff !important; }
  .yawp-identity { background-color: #1f1c16 !important; }
  .yawp-code { background-color: #1f1c16 !important; }
  .yawp-divider { border-color: #3c3828 !important; }
  .yawp-logo-light { display: none !important; max-height: 0 !important; overflow: hidden !important; }
  .yawp-logo-dark { display: block !important; max-height: none !important; }
  .yawp-footer { color: #b8b4a8 !important; }
}
[data-ogsc] .yawp-page { background-color: #1a1814 !important; }
[data-ogsc] .yawp-card { background-color: #2a2720 !important; }
[data-ogsc] .yawp-text { color: #f7f5ee !important; }
[data-ogsc] .yawp-muted { color: #b8b4a8 !important; }
[data-ogsc] .yawp-logo-light { display: none !important; }
[data-ogsc] .yawp-logo-dark { display: block !important; }
`.trim();

export const PREHEADER_PAD =
  '&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;';

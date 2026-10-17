# Preview resend evidence

Local, real-handler evidence for `di-signon-fix-preview-resend`; base `ff03e2590`.
See [validation.json](validation.json) for exact checks and limitations, and the
[runbook](../../../runbooks/unified-signon-preview-resend.md) for reproduction.

- `signon-22-{invited,notice,sent,sent-notice}-{1280,390}`: design, implementation
  and side-by-side triplets. Notice references use the adjacent unchanged state;
  there is no separate delivery-notice artboard.
- `before/`: reproduced INVITED and SENT delivery errors at both widths, with
  matching reference/comparison triplets. `*-before-after.png` shows correction.
- `flag-off-*-before-after.png`: login, signup and free-trial controls at both
  widths; all six have zero changed pixels in `flag-off-comparison.json`.
- `reference-provenance.json`: exact v2 DOM source and desktop adaptation. The
  source's broken blob logo is retained; implementation uses the real logo.

Identifiers and private codes/links are masked; mail content is checked privately.
The long disposable recipient can add a wrapped masked line. CTA hover and local
development tooling remain visible. No presentation code changed in this fix.
Owner approval delivery is real-handler/database coverage; browser SENT evidence
shows the anonymous no-delivery boundary. Hosted re-QA remains separate.

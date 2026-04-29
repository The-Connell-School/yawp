# Print Button — Student Document Page

## Overview

Add a print button to the student document page (`/app/documents/:id`) so users can print their document.

## Approach

**Recommended: `window.print()` with CSS `@media print`**

- Add a print button to the existing nav bar (alongside title, sync status, submit button)
- Button calls `window.print()`
- Add `@media print` styles that hide everything except the editor column: nav bar, tutor panel, comments panel, editor toolbar
- The editor content is already structured HTML from TipTap, so it renders cleanly
- Include a clean print header: document title, student name, date

**Alternative: Server-rendered PDF**

- Generate a PDF server-side (e.g. Puppeteer)
- Gives a downloadable file and consistent cross-browser output
- Significantly more complex to implement

The CSS approach is faster, works offline, and requires no new routes or server infrastructure. The tradeoff is that the browser print dialog varies across browsers/OS, which is usually acceptable.

## Open Questions

- Should it print the current draft, or only a submitted version?
- Should comments/annotations be included in the print output?
- Should teachers also have access to the print button, or just students?

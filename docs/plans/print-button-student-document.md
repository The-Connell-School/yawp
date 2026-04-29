# Print Button — Student Document Page

## Overview

Add a print button to the student document page (`/app/documents/:id`) so users can print their document.

## Decisions

- **What to print:** Current draft (including unsaved changes via live editor state). If the student is viewing a submitted version, print that.
- **Format:** Open a clean HTML page in a new tab and trigger the browser print dialog (users can Save as PDF). No extra dependencies needed — cleaner than `window.print()` on the full page.
- **Comments/annotations:** Not included. Strip `data-comment-id` spans from the HTML before printing.
- **Who gets it:** Both students and teachers.

## Approach

**New-window print (no dependencies)**

1. Add a Print button to the nav bar right side (alongside Submit, DocumentHistory).
2. On click, get the live editor HTML via `editorBridgeRef.current?.getContent().html` (captures unsaved changes), falling back to `data.doc.html`.
3. Strip comment annotation spans (`[data-comment-id]`) using `DOMParser` in the browser.
4. Open a new window with clean, styled HTML — title, student name, date as a header — then call `window.print()`.
5. Button shows for both students and teachers.

/**
 * Shared rendering for assistant replies in Yawp's teacher-facing chats
 * (Reporter, Lesson Planner). Both surfaces render the same Markdown dialect —
 * headings, tables, and <details> deep dives — and both offer a clean
 * print/PDF copy of a single reply, so the presentation lives here once.
 */
import { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import { cn } from '~/utils/misc';

// Scoped styling for rendered Markdown (no typography plugin in this app).
export const MARKDOWN_CLASS = cn(
  'text-sm leading-relaxed text-foreground/90',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground',
  '[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground',
  '[&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-muted-foreground',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-primary/60',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:marker:text-muted-foreground',
  '[&_li]:my-1 [&_li]:pl-1',
  '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic',
  '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_hr]:my-4 [&_hr]:border-border',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_code]:rounded [&_code]:bg-foreground/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  // Tables: rounded, bordered card with a soft header and row dividers.
  '[&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-hidden [&_table]:overflow-x-auto [&_table]:rounded-xl [&_table]:border [&_table]:border-border [&_table]:text-[13px]',
  '[&_thead]:bg-foreground/[0.035]',
  '[&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground',
  '[&_tbody_tr]:border-t [&_tbody_tr]:border-border/70',
  '[&_tbody_tr:hover]:bg-foreground/[0.02]',
  '[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:tabular-nums',
  // Collapsible detail blocks (click-to-expand deep dives).
  '[&_details]:my-3 [&_details]:rounded-xl [&_details]:border [&_details]:border-border [&_details]:bg-foreground/[0.02] [&_details]:px-3 [&_details]:py-2',
  '[&_details[open]]:bg-foreground/[0.03]',
  '[&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:font-medium [&_summary]:text-foreground [&_summary]:marker:text-primary',
  '[&_summary]:hover:text-primary',
  '[&_details>*:not(summary)]:mt-2'
);

/**
 * Send every link in a reply to its own tab.
 *
 * A teacher following a link out of a lesson plan is looking something up
 * mid-plan, not leaving. Navigating this tab away loses the conversation they
 * are in the middle of, which reads as the link being broken.
 *
 * Wraps marked's own link renderer rather than replacing it, so the URL is
 * still cleaned and escaped exactly as marked would; an href marked rejects
 * comes back as plain text and never matches the opening tag.
 */
function newTabRenderer(): InstanceType<typeof marked.Renderer> {
  const renderer = new marked.Renderer();
  const renderLink = renderer.link.bind(renderer);
  renderer.link = (href, title, text) =>
    renderLink(href, title, text).replace(
      /^<a /,
      '<a target="_blank" rel="noopener noreferrer" '
    );
  return renderer;
}

/** Markdown → sanitized HTML. Browser-only (DOMPurify needs a DOM). */
export function markdownToSafeHtml(content: string): string {
  const parsed = marked.parse(content, {
    async: false,
    gfm: true,
    renderer: newTabRenderer(),
  }) as string;
  return DOMPurify.sanitize(parsed, {
    ADD_TAGS: ['details', 'summary'],
    ADD_ATTR: ['open', 'target', 'rel'],
  });
}

/**
 * Render assistant Markdown as sanitized HTML. To avoid a hydration mismatch
 * (DOMPurify only runs in the browser) we render plain text on the server and
 * the first client paint, then upgrade to formatted HTML after mount.
 */
export function MarkdownContent({ content }: { content: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setHtml(markdownToSafeHtml(content));
  }, [content]);

  if (html === null) {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  return (
    <div
      className={MARKDOWN_CLASS}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Self-contained print styles (the popup can't see the app's Tailwind).
const PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; margin: 0; padding: 40px; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .report { max-width: 720px; margin: 0 auto; }
  .brand { display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #c05a3e; padding-bottom: 10px; margin-bottom: 20px; }
  .brand strong { font-size: 15px; color: #c05a3e; }
  .brand span { color: #6b7280; font-size: 12px; margin-left: auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 22px 0 8px; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 18px 0 6px; }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 4px 0; }
  strong { font-weight: 600; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 18px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  thead { background: #f5f3f0; }
  th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; color: #6b7280; padding: 8px 10px; }
  td { padding: 8px 10px; border-top: 1px solid #eee; vertical-align: top; }
  details { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; margin: 12px 0; }
  summary { font-weight: 600; }
  blockquote { border-left: 3px solid #c05a3e66; margin: 10px 0; padding-left: 12px; color: #4b5563; }
  @page { margin: 1.5cm; }
`;

/**
 * Open a clean, print-styled copy of a single assistant reply in a new window
 * and invoke the browser's print dialog — the teacher picks "Save as PDF" (or a
 * printer). No dependencies or server rendering; the popup is self-styled so it
 * doesn't depend on the app's Tailwind.
 */
export function printAssistantMessage(markdown: string, brand: string) {
  if (typeof window === 'undefined') return;
  const inner = markdownToSafeHtml(markdown);
  const win = window.open('', '_blank', 'width=880,height=1100');
  if (!win) {
    // Failing silently here reads as "the print button is broken", which is
    // exactly how it was reported.
    toast.error('Your browser blocked the print window.', {
      description: 'Allow pop-ups for Yawp, then try Print again.',
    });
    return;
  }
  const stamp = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const safeBrand = DOMPurify.sanitize(brand, { ALLOWED_TAGS: [] });
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8" />` +
      `<title>${safeBrand}</title><style>${PRINT_CSS}</style></head>` +
      `<body><main class="report">` +
      `<div class="brand"><strong>${safeBrand}</strong><span>${stamp}</span></div>` +
      inner +
      `</main></body></html>`
  );
  win.document.close();
  win.focus();
  const run = () => {
    // Expand any collapsed detail blocks so nothing is hidden in the PDF.
    win.document
      .querySelectorAll('details')
      .forEach((node) => node.setAttribute('open', ''));
    win.print();
  };
  // Give the popup a tick to lay out before printing.
  if (win.document.readyState === 'complete') setTimeout(run, 50);
  else win.onload = () => setTimeout(run, 50);
}

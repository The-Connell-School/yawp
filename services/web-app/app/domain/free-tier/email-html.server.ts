import { escapeHtml } from './html-escape.server';

const URL_LINE = /^https?:\/\//i;

/** Plain-text email body → HTML with clickable URL lines (copy wording unchanged). */
export function plainTextEmailToHtml(text: string) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (URL_LINE.test(trimmed)) {
        const href = escapeHtml(trimmed);
        return `<p><a href="${href}">${href}</a></p>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('');
}

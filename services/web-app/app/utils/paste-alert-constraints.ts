export const PASTE_ALERT_MIN_CHARS = 200;
export const PASTE_ALERT_MAX_CONTENT_CHARS = 50_000;

export function boundPasteAlertContent(content: string | null) {
  if (!content) {
    return { content, contentTruncated: false };
  }

  return {
    content: content.slice(0, PASTE_ALERT_MAX_CONTENT_CHARS),
    contentTruncated: content.length > PASTE_ALERT_MAX_CONTENT_CHARS,
  };
}

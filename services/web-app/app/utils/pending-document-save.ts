const PREFIX = 'yawp:pending-save';

type PendingSave = {
  docId: string;
  html: string;
  text: string;
  savedAt: number;
};

function getKey(docId: string) {
  return `${PREFIX}:${docId}`;
}

export function setPendingSave(
  docId: string,
  content: { html: string; text: string }
): void {
  try {
    const entry: PendingSave = {
      docId,
      html: content.html,
      text: content.text,
      savedAt: Date.now(),
    };
    localStorage.setItem(getKey(docId), JSON.stringify(entry));
  } catch {
    // Ignore localStorage failures to avoid crashing the editor.
  }
}

export function getPendingSave(
  docId: string
): PendingSave | null {
  try {
    const raw = localStorage.getItem(getKey(docId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.docId === 'string' &&
      typeof parsed.html === 'string' &&
      typeof parsed.text === 'string' &&
      typeof parsed.savedAt === 'number'
    ) {
      return parsed as PendingSave;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingSave(docId: string): void {
  try {
    localStorage.removeItem(getKey(docId));
  } catch {
    // Ignore localStorage failures.
  }
}

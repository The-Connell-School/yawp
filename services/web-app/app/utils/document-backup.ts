export const DOCUMENT_BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DOCUMENT_BACKUP_LEAVE_SNAPSHOT_LIMIT = 4;

const DOCUMENT_BACKUP_PREFIX = 'yawp:doc-backup:v1';

export type DocumentContentSnapshot = {
  html: string;
  text: string;
};

export type DocumentBackupV1 = {
  version: 1;
  docId: string;
  userId: string;
  draftHtml: string;
  draftText: string;
  draftHash: string;
  updatedAt: number;
  expiresAt: number;
  lastRemoteSyncHash: string | null;
  lastRemoteSyncAt: number | null;
  dismissedServerHash: string | null;
  leaveSnapshots?: DocumentBackupLeaveSnapshot[];
};

export type DocumentBackupLeaveSnapshot = {
  id: string;
  draftHtml: string;
  draftText: string;
  draftHash: string;
  updatedAt: number;
};

export type RecoveryCandidate = {
  backup: DocumentBackupV1;
  isDismissedForServer: boolean;
};

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeDocumentHash(content: DocumentContentSnapshot): string {
  const normalizedText = (content.text ?? '').replace(/\u00A0/g, ' ');
  const normalizedHtml = content.html ?? '';
  return hashString(`${normalizedText}\n---\n${normalizedHtml}`);
}

export function getDocumentBackupKey(args: { userId: string; docId: string }) {
  return `${DOCUMENT_BACKUP_PREFIX}:${args.userId}:${args.docId}`;
}

function isDocumentBackupV1(value: unknown): value is DocumentBackupV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    typeof candidate.docId === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.draftHtml === 'string' &&
    typeof candidate.draftText === 'string' &&
    typeof candidate.draftHash === 'string' &&
    typeof candidate.updatedAt === 'number' &&
    typeof candidate.expiresAt === 'number' &&
    (typeof candidate.lastRemoteSyncHash === 'string' ||
      candidate.lastRemoteSyncHash === null) &&
    (typeof candidate.lastRemoteSyncAt === 'number' ||
      candidate.lastRemoteSyncAt === null) &&
    (typeof candidate.dismissedServerHash === 'string' ||
      candidate.dismissedServerHash === null) &&
    (candidate.leaveSnapshots === undefined ||
      (Array.isArray(candidate.leaveSnapshots) &&
        candidate.leaveSnapshots.every(isDocumentBackupLeaveSnapshot)))
  );
}

function isDocumentBackupLeaveSnapshot(
  value: unknown
): value is DocumentBackupLeaveSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.draftHtml === 'string' &&
    typeof candidate.draftText === 'string' &&
    typeof candidate.draftHash === 'string' &&
    typeof candidate.updatedAt === 'number'
  );
}

function normalizeLeaveSnapshots(
  value: DocumentBackupV1['leaveSnapshots']
): DocumentBackupLeaveSnapshot[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isDocumentBackupLeaveSnapshot)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, DOCUMENT_BACKUP_LEAVE_SNAPSHOT_LIMIT);
}

function removeBackupItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore localStorage failures to avoid crashing the editor.
  }
}

export function readDocumentBackup(args: {
  userId: string;
  docId: string;
  now?: number;
}): DocumentBackupV1 | null {
  if (typeof window === 'undefined') return null;
  const key = getDocumentBackupKey(args);

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isDocumentBackupV1(parsed)) {
      removeBackupItem(key);
      return null;
    }
    const now = args.now ?? Date.now();
    if (parsed.expiresAt < now) {
      removeBackupItem(key);
      return null;
    }
    const leaveSnapshots = normalizeLeaveSnapshots(parsed.leaveSnapshots);
    return {
      ...parsed,
      leaveSnapshots: leaveSnapshots.length > 0 ? leaveSnapshots : undefined,
    };
  } catch {
    removeBackupItem(key);
    return null;
  }
}

export function writeDocumentBackup(args: {
  userId: string;
  docId: string;
  content: DocumentContentSnapshot;
  now?: number;
}): DocumentBackupV1 | null {
  if (typeof window === 'undefined') return null;
  const now = args.now ?? Date.now();
  const key = getDocumentBackupKey(args);
  const existing = readDocumentBackup({
    userId: args.userId,
    docId: args.docId,
    now,
  });
  const draftHash = computeDocumentHash(args.content);

  const next: DocumentBackupV1 = {
    version: 1,
    docId: args.docId,
    userId: args.userId,
    draftHtml: args.content.html,
    draftText: args.content.text,
    draftHash,
    updatedAt: now,
    expiresAt: now + DOCUMENT_BACKUP_TTL_MS,
    lastRemoteSyncHash: existing?.lastRemoteSyncHash ?? null,
    lastRemoteSyncAt: existing?.lastRemoteSyncAt ?? null,
    dismissedServerHash: existing?.dismissedServerHash ?? null,
    leaveSnapshots: existing?.leaveSnapshots,
  };

  try {
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

export function appendDocumentBackupLeaveSnapshot(args: {
  userId: string;
  docId: string;
  content: DocumentContentSnapshot;
  now?: number;
}): DocumentBackupV1 | null {
  if (typeof window === 'undefined') return null;
  const now = args.now ?? Date.now();
  const current =
    writeDocumentBackup({
      userId: args.userId,
      docId: args.docId,
      content: args.content,
      now,
    }) ??
    readDocumentBackup({
      userId: args.userId,
      docId: args.docId,
      now,
    });

  if (!current) return null;

  const existingSnapshots = normalizeLeaveSnapshots(current.leaveSnapshots);
  if (existingSnapshots[0]?.draftHash === current.draftHash) {
    return {
      ...current,
      leaveSnapshots:
        existingSnapshots.length > 0 ? existingSnapshots : undefined,
    };
  }

  const nextSnapshots = [
    {
      id: `${now}-${current.draftHash}`,
      draftHtml: current.draftHtml,
      draftText: current.draftText,
      draftHash: current.draftHash,
      updatedAt: now,
    },
    ...existingSnapshots,
  ].slice(0, DOCUMENT_BACKUP_LEAVE_SNAPSHOT_LIMIT);

  const key = getDocumentBackupKey(args);
  const next: DocumentBackupV1 = {
    ...current,
    leaveSnapshots: nextSnapshots,
    updatedAt: now,
    expiresAt: now + DOCUMENT_BACKUP_TTL_MS,
  };

  try {
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch {
    return current;
  }
}

export function markDocumentBackupRemoteSync(args: {
  userId: string;
  docId: string;
  content: DocumentContentSnapshot;
  now?: number;
}): DocumentBackupV1 | null {
  const now = args.now ?? Date.now();
  const current =
    writeDocumentBackup({
      userId: args.userId,
      docId: args.docId,
      content: args.content,
      now,
    }) ??
    readDocumentBackup({
      userId: args.userId,
      docId: args.docId,
      now,
    });

  if (!current || typeof window === 'undefined') return current;

  const key = getDocumentBackupKey(args);
  const next: DocumentBackupV1 = {
    ...current,
    expiresAt: now + DOCUMENT_BACKUP_TTL_MS,
    lastRemoteSyncHash: current.draftHash,
    lastRemoteSyncAt: now,
  };
  try {
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch {
    return current;
  }
}

export function markDocumentBackupDismissedForServer(args: {
  userId: string;
  docId: string;
  serverHash: string;
  now?: number;
}): DocumentBackupV1 | null {
  if (typeof window === 'undefined') return null;
  const now = args.now ?? Date.now();
  const current = readDocumentBackup({
    userId: args.userId,
    docId: args.docId,
    now,
  });
  if (!current) return null;

  const key = getDocumentBackupKey(args);
  const next: DocumentBackupV1 = {
    ...current,
    dismissedServerHash: args.serverHash,
    expiresAt: now + DOCUMENT_BACKUP_TTL_MS,
  };
  try {
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch {
    return current;
  }
}

export function clearDocumentBackupDismissedForServer(args: {
  userId: string;
  docId: string;
  serverHash: string;
  now?: number;
}): DocumentBackupV1 | null {
  if (typeof window === 'undefined') return null;
  const now = args.now ?? Date.now();
  const current = readDocumentBackup({
    userId: args.userId,
    docId: args.docId,
    now,
  });
  if (!current) return null;
  if (current.dismissedServerHash !== args.serverHash) return current;

  const key = getDocumentBackupKey(args);
  const next: DocumentBackupV1 = {
    ...current,
    dismissedServerHash: null,
    expiresAt: now + DOCUMENT_BACKUP_TTL_MS,
  };
  try {
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  } catch {
    return current;
  }
}

export function getRecoveryCandidate(args: {
  userId: string;
  docId: string;
  serverHash: string;
  now?: number;
}): RecoveryCandidate | null {
  const backup = readDocumentBackup({
    userId: args.userId,
    docId: args.docId,
    now: args.now,
  });
  if (!backup) return null;
  if (backup.draftHash === args.serverHash) return null;

  return {
    backup,
    isDismissedForServer: backup.dismissedServerHash === args.serverHash,
  };
}

export function getBackupPreviewText(text: string, maxChars = 360): string {
  const normalized = (text ?? '').trim();
  if (!normalized) return '(No text preview available)';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

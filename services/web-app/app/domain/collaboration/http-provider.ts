import * as Y from 'yjs';

/**
 * A minimal Yjs provider that syncs over ordinary HTTP requests.
 *
 * This replaces a hosted WebSocket provider. It is viable — not a hack — because
 * Yjs updates are commutative and idempotent: receiving them a second late, twice,
 * or out of order converges on the same document. So the provider needs no session,
 * no socket and no delivery ordering, just a cursor.
 *
 * What it costs is latency before a *collaborator's* text appears, roughly the poll
 * interval. What it does not cost is the writer's own experience: local edits are
 * applied by the editor before this provider ever sees them, so typing is always
 * instant.
 *
 * `fetchImpl` and `now` are injectable so the sync logic is testable without a
 * browser.
 */

/**
 * Just the callable shape, not `typeof fetch` — that type also carries statics
 * like `preconnect`, which a wrapper function cannot satisfy.
 */
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/** Tag for updates we applied from the server, so they are not echoed back. */
export const REMOTE_ORIGIN = 'yawp-collab-remote';

export type CollabProviderOptions = {
  documentId: string;
  ydoc: Y.Doc;
  /** False for a teacher: they follow the draft but never write to it. */
  canWrite: boolean;
  /** How long to gather local edits before sending them. */
  sendDebounceMs?: number;
  /** How often to ask for collaborators' edits. */
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
  onStatusChange?: (status: CollabStatus) => void;
  onPresenceChange?: (present: PresentMember[]) => void;
};

export type CollabStatus =
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'error'; message: string };

export type PresentMember = { membershipId: string; name: string };

/**
 * 250ms of batching turns a burst of keystrokes into one request without being
 * perceptible — the local editor has already rendered them.
 */
const DEFAULT_SEND_DEBOUNCE_MS = 250;
/** One second: the agreed latency budget for a collaborator's text appearing. */
const DEFAULT_POLL_INTERVAL_MS = 1000;

export class CollabHttpProvider {
  private readonly documentId: string;
  private readonly ydoc: Y.Doc;
  private readonly canWrite: boolean;
  private readonly sendDebounceMs: number;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly onStatusChange?: (status: CollabStatus) => void;
  private readonly onPresenceChange?: (present: PresentMember[]) => void;

  /** Server cursor: the highest sequence this client has applied. */
  private cursor = 0;
  private pending: Uint8Array[] = [];
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  /** Guards against overlapping requests when one is slow. */
  private sending = false;
  private polling = false;

  private readonly handleLocalUpdate: (update: Uint8Array, origin: unknown) => void;

  constructor(options: CollabProviderOptions) {
    this.documentId = options.documentId;
    this.ydoc = options.ydoc;
    this.canWrite = options.canWrite;
    this.sendDebounceMs = options.sendDebounceMs ?? DEFAULT_SEND_DEBOUNCE_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    // Wrapped, not assigned. `this.fetchImpl(...)` calls with the provider as
    // `this`, and the browser's fetch throws "Illegal invocation" unless it is
    // called on the global. Assigning it bare means no request ever leaves the
    // page — which is exactly what happened, and what the tests missed by always
    // injecting a fetch.
    this.fetchImpl =
      options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.onStatusChange = options.onStatusChange;
    this.onPresenceChange = options.onPresenceChange;

    this.handleLocalUpdate = (update, origin) => {
      // Anything we just applied from the server must not be sent back, or two
      // clients would trade the same bytes forever.
      if (origin === REMOTE_ORIGIN || this.destroyed || !this.canWrite) return;
      this.pending.push(update);
      this.scheduleSend();
    };

    this.ydoc.on('update', this.handleLocalUpdate);
  }

  private get endpoint() {
    return `/api/collab/${encodeURIComponent(this.documentId)}/updates`;
  }

  /** Catches up on the room, then starts polling. */
  async start(): Promise<void> {
    this.onStatusChange?.({ kind: 'connecting' });

    const caughtUp = await this.pullOnce();
    if (this.destroyed) return;

    if (!caughtUp) {
      this.onStatusChange?.({
        kind: 'error',
        message:
          'Could not load your group’s draft. Check your connection and reload — nothing your group has written is lost.',
      });
      return;
    }

    this.onStatusChange?.({ kind: 'live' });
    this.schedulePoll();
  }

  private scheduleSend() {
    if (this.sendTimer) return;
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      void this.flush();
    }, this.sendDebounceMs);
  }

  private schedulePoll() {
    if (this.destroyed || this.pollTimer) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.pullOnce().then(() => this.schedulePoll());
    }, this.pollIntervalMs);
  }

  /**
   * Sends everything gathered so far.
   *
   * On failure the batch goes back at the front of the queue rather than being
   * dropped, so a blip costs latency instead of a student's sentence.
   */
  async flush(): Promise<void> {
    if (this.destroyed || !this.canWrite || this.sending) return;
    if (this.pending.length === 0) return;

    const batch = this.pending;
    this.pending = [];
    this.sending = true;

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          updates: batch.map((update) => bytesToBase64(update)),
        }),
      });

      if (!response.ok) throw new Error(`send failed: ${response.status}`);
    } catch {
      this.pending = [...batch, ...this.pending];
      this.onStatusChange?.({
        kind: 'error',
        message: 'Your last few edits have not saved yet. Still trying…',
      });
    } finally {
      this.sending = false;
    }
  }

  /** Applies everything new. Returns false only if the request itself failed. */
  private async pullOnce(): Promise<boolean> {
    if (this.destroyed || this.polling) return true;
    this.polling = true;

    try {
      const response = await this.fetchImpl(
        `${this.endpoint}?since=${this.cursor}`,
        { headers: { accept: 'application/json' } }
      );
      if (!response.ok) return false;

      const body = (await response.json()) as {
        cursor?: number;
        updates?: string[];
        present?: PresentMember[];
      };
      if (this.destroyed) return true;

      for (const encoded of body.updates ?? []) {
        // Tagged as remote so the local handler does not send it back. Applying
        // our own echoed update is a no-op, which is why the cursor is not
        // advanced by sending — doing so could skip a collaborator's update that
        // landed at a lower sequence.
        Y.applyUpdate(this.ydoc, base64ToBytes(encoded), REMOTE_ORIGIN);
      }

      if (typeof body.cursor === 'number' && body.cursor > this.cursor) {
        this.cursor = body.cursor;
      }
      if (body.present) this.onPresenceChange?.(body.present);

      return true;
    } catch {
      return false;
    } finally {
      this.polling = false;
    }
  }

  destroy() {
    this.destroyed = true;
    this.ydoc.off('update', this.handleLocalUpdate);
    if (this.sendTimer) clearTimeout(this.sendTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.sendTimer = null;
    this.pollTimer = null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

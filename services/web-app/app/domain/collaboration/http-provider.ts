import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import * as Y from 'yjs';
import {
  isPresenceActivity,
  PRESENCE_HEARTBEAT_MS,
  type PresenceActivity,
} from './presence';

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
 * Carets ride on the same transport. Presence is *not* document state — a
 * cursor position is worth nothing a second after it is sent — so it is read
 * from the same poll (same cadence, same draft, no second timer) and written to
 * its own endpoint, where it can never reach the room's permanent update log.
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
  /** How long to settle a moving cursor before publishing where it landed. */
  presenceDebounceMs?: number;
  /** How often a writer who is not typing re-asserts that they are there. */
  presenceHeartbeatMs?: number;
  fetchImpl?: FetchLike;
  onStatusChange?: (status: CollabStatus) => void;
  onPresenceChange?: (presence: CollabPresence[]) => void;
};

export type CollabStatus =
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'error'; message: string };

/** Browser-safe view of an awareness state for the roster UI. */
export type CollabPresence = {
  clientId: number;
  membershipId: string;
  name: string;
  color: string;
  activity: PresenceActivity;
  hasCursor: boolean;
};

/**
 * 250ms of batching turns a burst of keystrokes into one request without being
 * perceptible — the local editor has already rendered them.
 */
const DEFAULT_SEND_DEBOUNCE_MS = 250;
/** One second: the agreed latency budget for a collaborator's text appearing. */
const DEFAULT_POLL_INTERVAL_MS = 1000;
/**
 * Short enough that a caret follows the sentence being typed rather than
 * arriving after it, long enough that holding an arrow key is one request.
 */
const DEFAULT_PRESENCE_DEBOUNCE_MS = 200;

export class CollabHttpProvider {
  private readonly documentId: string;
  private readonly ydoc: Y.Doc;
  private readonly canWrite: boolean;
  private readonly sendDebounceMs: number;
  private readonly pollIntervalMs: number;
  private readonly presenceDebounceMs: number;
  private readonly presenceHeartbeatMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly onStatusChange?: (status: CollabStatus) => void;
  private readonly onPresenceChange?: (presence: CollabPresence[]) => void;

  /**
   * The caret channel, exposed because TipTap's `CollaborationCursor` takes a
   * provider and reads `provider.awareness` off it. Built on this document's
   * `Y.Doc` so its client id is the same one the document's own items carry —
   * which is what lets a caret and the text it wrote belong to one person.
   */
  readonly awareness: Awareness;

  /** Server cursor: the highest sequence this client has applied. */
  private cursor = 0;
  private pending: Uint8Array[] = [];
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  /** Guards against overlapping requests when one is slow. */
  private sending = false;
  private polling = false;

  private readonly handleLocalUpdate: (
    update: Uint8Array,
    origin: unknown
  ) => void;
  private readonly handleAwarenessUpdate: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => void;
  private readonly handleAwarenessChange: () => void;

  constructor(options: CollabProviderOptions) {
    this.documentId = options.documentId;
    this.ydoc = options.ydoc;
    this.canWrite = options.canWrite;
    this.sendDebounceMs = options.sendDebounceMs ?? DEFAULT_SEND_DEBOUNCE_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.presenceDebounceMs =
      options.presenceDebounceMs ?? DEFAULT_PRESENCE_DEBOUNCE_MS;
    this.presenceHeartbeatMs =
      options.presenceHeartbeatMs ?? PRESENCE_HEARTBEAT_MS;
    this.awareness = new Awareness(this.ydoc);
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

    this.handleAwarenessUpdate = ({ added, updated, removed }, origin) => {
      // Applying a teammate's caret fires this same event. Republishing it
      // would have two browsers trading one cursor forever, so only a change to
      // *our own* state, made locally, is worth a request.
      if (origin === REMOTE_ORIGIN || this.destroyed || !this.canWrite) return;
      const touched = [...added, ...updated, ...removed];
      if (!touched.includes(this.awareness.clientID)) return;
      this.schedulePresenceSend();
    };
    this.handleAwarenessChange = () => {
      this.onPresenceChange?.(this.getPresence());
    };

    this.ydoc.on('update', this.handleLocalUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
    this.awareness.on('change', this.handleAwarenessChange);
  }

  /**
   * Updates the local tab's human-readable state without disturbing TipTap's
   * cursor or selection fields. The server still constrains this value before
   * teammates receive it.
   */
  setPresenceActivity(activity: PresenceActivity) {
    if (this.destroyed || !this.canWrite) return;
    this.awareness.setLocalStateField('activity', activity);
  }

  /** Current people reported by Yjs awareness, normalized for the roster. */
  getPresence(): CollabPresence[] {
    const presence: CollabPresence[] = [];

    for (const [clientId, state] of this.awareness.getStates()) {
      const user = state.user;
      if (typeof user !== 'object' || user === null || Array.isArray(user)) {
        continue;
      }

      const candidate = user as Record<string, unknown>;
      if (
        typeof candidate.membershipId !== 'string' ||
        typeof candidate.name !== 'string' ||
        typeof candidate.color !== 'string'
      ) {
        continue;
      }

      presence.push({
        clientId,
        membershipId: candidate.membershipId,
        name: candidate.name,
        color: candidate.color,
        activity: isPresenceActivity(state.activity)
          ? state.activity
          : 'viewing',
        hasCursor:
          typeof state.cursor === 'object' &&
          state.cursor !== null &&
          !Array.isArray(state.cursor),
      });
    }

    return presence;
  }

  /**
   * Says goodbye immediately while leaving the provider alive long enough to
   * finish a queued document flush. Route cleanup must not make the ephemeral
   * roster wait behind durable writes.
   */
  leave() {
    if (this.destroyed || !this.canWrite) return;
    this.awareness.setLocalState(null);

    // A route transition may cancel ordinary fetch work even with keepalive.
    // sendBeacon exists for exactly this small, same-origin goodbye and carries
    // the session cookie while the old page is already yielding control.
    const beacon = globalThis.navigator?.sendBeacon;
    if (typeof beacon === 'function') {
      const update = encodeAwarenessUpdate(this.awareness, [
        this.awareness.clientID,
      ]);
      const queued = beacon.call(
        globalThis.navigator,
        this.presenceEndpoint,
        JSON.stringify({ awareness: bytesToBase64(update) })
      );
      if (queued) return;
    }

    void this.sendPresence({ keepalive: true });
  }

  private get endpoint() {
    return `/api/collab/${encodeURIComponent(this.documentId)}/updates`;
  }

  private get presenceEndpoint() {
    return `/api/collab/${encodeURIComponent(this.documentId)}/presence`;
  }

  /**
   * Catches up on the room, then starts polling.
   *
   * A destroyed provider is finished, and says so by doing nothing rather than
   * announcing "connecting" and then never connecting. That distinction is not
   * hypothetical: a memoized provider handed back to React StrictMode's second
   * effect setup left the editor reporting "Opening your group's draft…"
   * indefinitely. The component builds a fresh provider per effect now, and this
   * guard makes the same mistake visible instead of silent.
   */
  async start(): Promise<void> {
    if (this.destroyed) return;

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

    // Announce arrival rather than waiting for the first cursor move or the
    // first beat. Presence is "who is in the room", and someone reading their
    // group's draft without clicking into it is in it — they simply have no
    // caret to draw yet.
    if (this.canWrite) void this.sendPresence();
    this.scheduleHeartbeat();
  }

  private scheduleSend() {
    if (this.sendTimer) return;
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      void this.flush();
    }, this.sendDebounceMs);
  }

  private schedulePresenceSend() {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      void this.sendPresence();
    }, this.presenceDebounceMs);
  }

  /**
   * A writer who is reading rather than typing still has a caret, and the
   * server's TTL is what covers a browser that vanished. Without a beat between
   * the two, someone sitting still would lose their caret mid-sentence.
   */
  private scheduleHeartbeat() {
    if (this.destroyed || !this.canWrite || this.heartbeatTimer) return;
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      void this.sendPresence().finally(() => this.scheduleHeartbeat());
    }, this.presenceHeartbeatMs);
  }

  /**
   * Publishes where this client's cursor is.
   *
   * Failure is silent, and deliberately so. A caret is worth nothing a second
   * later: retrying a stale position is worse than dropping it, and putting an
   * error banner over the draft because a cursor did not arrive would be a
   * bigger interruption than the missing cursor. The next beat carries the
   * current position, and the server's TTL handles a client that stops.
   */
  private async sendPresence({ keepalive = false } = {}): Promise<void> {
    if (!this.canWrite) return;

    const update = encodeAwarenessUpdate(this.awareness, [
      this.awareness.clientID,
    ]);

    try {
      await this.fetchImpl(this.presenceEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The goodbye is sent from `destroy`, as the page is going away. Without
        // keepalive the browser cancels it with the rest of the page's requests
        // and the caret lingers until the TTL expires it.
        keepalive,
        body: JSON.stringify({ awareness: bytesToBase64(update) }),
      });
    } catch {
      // Intentionally ignored; see above.
    }
  }

  /**
   * Reconciles the carets on screen with the ones the server says are live.
   *
   * The response is the whole live set, not a delta, which makes this both the
   * apply and the removal: a client we are still showing that the server no
   * longer names has gone, whether it said goodbye or simply stopped.
   */
  private applyPresence(entries: { clientId: number; state: string }[]) {
    const live = new Set<number>();

    for (const entry of entries) {
      live.add(entry.clientId);
      // Our own state, echoed back. Applying it would be a no-op — the clock is
      // ours and cannot be newer than what we hold — so skip the work.
      if (entry.clientId === this.awareness.clientID) continue;
      try {
        applyAwarenessUpdate(
          this.awareness,
          base64ToBytes(entry.state),
          REMOTE_ORIGIN
        );
      } catch {
        // One unreadable caret must not cost the others.
      }
    }

    const gone = [...this.awareness.getStates().keys()].filter(
      (clientId) => clientId !== this.awareness.clientID && !live.has(clientId)
    );
    if (gone.length > 0) {
      removeAwarenessStates(this.awareness, gone, REMOTE_ORIGIN);
    }
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
        presence?: { clientId: number; state: string }[];
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
      if (body.presence) this.applyPresence(body.presence);

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
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.awareness.off('change', this.handleAwarenessChange);

    if (this.sendTimer) clearTimeout(this.sendTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.sendTimer = null;
    this.pollTimer = null;
    this.presenceTimer = null;
    this.heartbeatTimer = null;

    // Say goodbye before tearing down, so a teammate's screen loses the caret
    // when the tab closes rather than fifteen seconds later. `setLocalState`
    // must come first: it is what makes the encoded state a removal.
    const leaving = this.canWrite;
    this.awareness.setLocalState(null);
    if (leaving) void this.sendPresence({ keepalive: true });

    // Destroying the Awareness clears its own renewal interval, which would
    // otherwise keep a timer alive for the life of the page.
    this.awareness.destroy();
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

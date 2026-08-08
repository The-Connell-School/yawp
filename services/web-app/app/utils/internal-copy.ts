// App-wide (not per-document, not per-tab) provenance record: "what the
// most recent copy/cut anywhere in YAWP put on the clipboard." Lives in
// localStorage so it's visible across tabs of the same browser profile.
//
// The rule, per Bryant: anything copied or cut from inside the app and
// pasted back into the app is never an alert — regardless of which
// document, which tab, or how much time passed. Only content that arrived
// from outside the app should raise one. A global, non-expiring,
// cross-tab record is the simplest way to express that rule directly,
// rather than the narrower "same document, same tab, within 5s" proxy
// this used to check.
//
// The listeners that write this record are registered once by the root
// layout (see useInternalCopyMarker), not by the document editor, so a
// copy made on any page in the app — class detail, an assignment prompt,
// writing lessons — is recognized when the student later pastes into an
// editor.
//
// What is stored is a hash of the copied text, never the text itself. That
// lets a student paste the same in-app passage into several places without
// the second paste looking external, and keeps the record small.
//
// What this still can't catch: a student who copies from YAWP, then copies
// something *else* from outside YAWP before pasting, gets one suppressed
// paste (see the fallback in wasCopiedInsideApp) before alerts resume. And
// it doesn't cross browser profiles or devices — a copy in one
// profile/incognito window and paste in another looks external. Both are
// accepted misses: a false alarm here wrongly implies a student did
// something they didn't, which is worse than an occasional miss.
export const APP_INTERNAL_COPY_KEY = 'yawp-internal-clipboard-copy';

// Written when a copy happened but the copied text could not be read (an
// input or textarea selection, say). Also how any older stored value is
// treated, so a tab open across a deploy degrades gracefully.
const UNREADABLE_COPY = '*';
const HASH_PREFIX = 'h:';

/**
 * Whitespace is normalized away before hashing: the DOM selection string
 * and what the browser actually places on the clipboard often differ in
 * line breaks and trailing spaces, and that difference must not read as
 * "this came from somewhere else".
 */
function fingerprint(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();

  // FNV-1a, 32-bit. Not a security boundary — just a compact, stable key.
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${HASH_PREFIX}${(hash >>> 0).toString(36)}:${normalized.length}`;
}

export function markInternalCopy(copiedText?: string | null) {
  const text = copiedText?.trim() ?? '';
  localStorage.setItem(
    APP_INTERNAL_COPY_KEY,
    text ? fingerprint(text) : UNREADABLE_COPY
  );
}

/**
 * True when this paste should be treated as a same-app round trip.
 *
 * An exact match against the last in-app copy leaves the record in place,
 * so the same passage can be pasted repeatedly. Anything else — an
 * unreadable copy, a value from before content matching, or a mismatch —
 * still suppresses one paste and then clears, which is exactly what this
 * did before content matching existed. Nothing here can raise an alert
 * that the old rule would have suppressed.
 */
export function wasCopiedInsideApp(pastedText: string): boolean {
  const stored = localStorage.getItem(APP_INTERNAL_COPY_KEY);
  if (!stored) return false;

  if (stored.startsWith(HASH_PREFIX) && stored === fingerprint(pastedText)) {
    return true;
  }

  localStorage.removeItem(APP_INTERNAL_COPY_KEY);
  return true;
}

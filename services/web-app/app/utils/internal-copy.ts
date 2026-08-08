// App-wide (not per-document, not per-tab) provenance flag: "the most
// recent copy/cut anywhere in YAWP came from inside YAWP." Lives in
// localStorage so it's visible across tabs of the same browser profile.
//
// The rule, per Bryant: anything copied or cut from inside the app and
// pasted back into the app is never an alert — regardless of which
// document, which tab, or how much time passed. Only content that arrived
// from outside the app should raise one. A global, non-expiring,
// cross-tab flag is the simplest way to express that rule directly,
// rather than the narrower "same document, same tab, within 5s" proxy
// this used to check.
//
// The listeners that set this flag are registered once by the /app layout
// (see useInternalCopyMarker), not by the document editor, so a copy made
// on any page in the app — class detail, an assignment prompt, writing
// lessons — is recognized when the student later pastes into an editor.
//
// What this still can't catch: a student who copies from YAWP, then
// copies something *else* from outside YAWP before pasting, would slip
// through as a false negative (the flag stays set until consumed by the
// next paste). And it doesn't cross browser profiles or devices — a copy
// in one profile/incognito window and paste in another looks external.
// Both are accepted misses: a false alarm here wrongly implies a student
// did something they didn't, which is worse than an occasional miss.
export const APP_INTERNAL_COPY_KEY = 'yawp-internal-clipboard-copy';

export function markInternalCopy() {
  localStorage.setItem(APP_INTERNAL_COPY_KEY, 'true');
}

export function consumeInternalCopyFlag(): boolean {
  const wasInternal = localStorage.getItem(APP_INTERNAL_COPY_KEY) === 'true';
  if (wasInternal) {
    localStorage.removeItem(APP_INTERNAL_COPY_KEY);
  }
  return wasInternal;
}

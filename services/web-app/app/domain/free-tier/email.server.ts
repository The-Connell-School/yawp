// Placeholder: hook for the "you have been selected" email.
// Implemented in a later PR. No-op in this PR.
export interface ReleaseEmailPayload {
  applicationId: string;
  email: string;
  name: string;
  schoolName: string;
  label?: string;
}

export async function sendFreeTierReleaseEmail(_payload: ReleaseEmailPayload): Promise<void> {
  // Intentionally empty.
  return;
}


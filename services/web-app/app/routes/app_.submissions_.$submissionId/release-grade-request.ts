export const RELEASE_GRADE_FALLBACK_MESSAGE =
  'Could not release the grade. Please refresh and try again.';

export type RequestGradeReleaseResult =
  | { ok: true }
  | { ok: false; message: string };

export async function requestGradeRelease(
  submissionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<RequestGradeReleaseResult> {
  try {
    const form = new FormData();
    form.append('submissionIds', submissionId);
    const res = await fetchImpl('/api/domain/release-grades', {
      method: 'POST',
      body: form,
    });
    const body = (await res.json().catch(() => null)) as
      | { success?: boolean; message?: string }
      | null;
    if (!res.ok) {
      return {
        ok: false,
        message:
          (body && typeof body.message === 'string' && body.message) ||
          RELEASE_GRADE_FALLBACK_MESSAGE,
      };
    }
    if (body && body.success === true) {
      return { ok: true };
    }
    return { ok: false, message: RELEASE_GRADE_FALLBACK_MESSAGE };
  } catch {
    return { ok: false, message: RELEASE_GRADE_FALLBACK_MESSAGE };
  }
}


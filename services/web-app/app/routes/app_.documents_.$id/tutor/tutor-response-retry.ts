/**
 * Cross-provider fallback is disabled for the tutor's AI call
 * (allowFallbackProvider: false on its getLLMCompletion call), so the
 * server can no longer signal a 202 "retrying" response asking the client
 * to resubmit onto a fallback model - there is nothing left to retry onto.
 * This is now a plain single POST.
 */
export async function postTutorResponse({
  fetcher = fetch,
  formData,
}: {
  fetcher?: typeof fetch;
  formData: FormData;
}) {
  const response = await fetcher('/api/domain/tutor-response', {
    method: 'POST',
    body: formData,
  });
  const json = await response.json();
  return { response, json };
}

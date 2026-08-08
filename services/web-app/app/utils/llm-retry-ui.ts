/**
 * Cross-provider fallback is disabled for every AI call site that used to
 * use this helper (grading, tutor) - see allowFallbackProvider: false on
 * those getLLMCompletion calls. That means the server can no longer signal
 * a 202 "retrying" response asking the client to resubmit onto a fallback
 * model, so there is nothing left to retry onto. This is now a plain
 * single POST.
 */
export async function postJsonForm({
  fetcher = fetch,
  formData,
  action,
}: {
  fetcher?: typeof fetch;
  formData: FormData;
  action: string;
}) {
  const response = await fetcher(action, {
    method: 'POST',
    body: formData,
  });
  const json = await response.json();
  return { response, json };
}

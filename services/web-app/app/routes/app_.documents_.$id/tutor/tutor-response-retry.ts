function cloneFormData(source: FormData) {
  const copy = new FormData();
  for (const [key, value] of source.entries()) {
    copy.append(key, value);
  }
  return copy;
}

async function postTutorResponse({
  fetcher,
  formData,
}: {
  fetcher: typeof fetch;
  formData: FormData;
}) {
  const response = await fetcher('/api/domain/tutor-response', {
    method: 'POST',
    body: formData,
  });
  const json = await response.json();
  return { response, json };
}

export async function postTutorResponseWithFallbackRetry({
  fetcher = fetch,
  formData,
  onRetry,
}: {
  fetcher?: typeof fetch;
  formData: FormData;
  onRetry?: () => void;
}) {
  const firstAttempt = await postTutorResponse({ fetcher, formData });
  if (
    firstAttempt.response.status !== 202 ||
    firstAttempt.json?.retrying !== true
  ) {
    return firstAttempt;
  }

  onRetry?.();
  const retryFormData = cloneFormData(formData);
  retryFormData.set('llmRetry', 'fallback');
  return postTutorResponse({ fetcher, formData: retryFormData });
}

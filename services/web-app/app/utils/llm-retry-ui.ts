export function isLlmRetryResponse(data: unknown): data is { retrying: true } {
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    (data as { retrying?: unknown }).retrying === true
  );
}

export function cloneFormDataWithFallbackRetry(source: FormData) {
  const copy = new FormData();
  for (const [key, value] of source.entries()) {
    copy.append(key, value);
  }
  copy.set('llmRetry', 'fallback');
  return copy;
}

async function postForm({
  fetcher,
  formData,
  action,
}: {
  fetcher: typeof fetch;
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

export async function postFormWithFallbackRetry({
  fetcher = fetch,
  formData,
  action,
  onRetry,
}: {
  fetcher?: typeof fetch;
  formData: FormData;
  action: string;
  onRetry?: () => void;
}) {
  const firstAttempt = await postForm({ fetcher, formData, action });
  if (
    firstAttempt.response.status !== 202 ||
    !isLlmRetryResponse(firstAttempt.json)
  ) {
    return firstAttempt;
  }

  onRetry?.();
  return postForm({
    fetcher,
    formData: cloneFormDataWithFallbackRetry(formData),
    action,
  });
}

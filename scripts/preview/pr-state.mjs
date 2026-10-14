// The preview repository is public. Anonymous GitHub checks need no host token.
export function createPrStateLookup({ repository = 'The-Connell-School/yawp', fetchFn = fetch, now = () => Date.now() / 1000 } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid preview repository');
  const cache = new Map();
  const pending = new Map();
  return async (pr) => {
    if (!Number.isSafeInteger(pr) || pr < 1) return null;
    const cached = cache.get(pr);
    if (cached && now() - cached.at < 60) return cached.value;
    if (pending.has(pr)) return pending.get(pr);
    const operation = (async () => {
      let value = null;
      try {
        const response = await fetchFn(`https://api.github.com/repos/${repository}/pulls/${pr}`, {
          headers: { accept: 'application/vnd.github+json', 'user-agent': 'yawp-preview-ingress' },
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const data = await response.json();
          value = { state: data.state, branch: String(data.head?.ref || '').slice(0, 256), author: String(data.user?.login || '').slice(0, 128) };
        }
      } catch { /* Fail closed on API outage or timeout. */ }
      cache.set(pr, { at: now(), value });
      return value;
    })().finally(() => pending.delete(pr));
    pending.set(pr, operation);
    return operation;
  };
}

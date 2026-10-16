// The repository is public. One coalesced open-PR snapshot bounds anonymous
// GitHub usage to ~12 requests/hour; the shell rechecks each wake under its lock.
export function createPrStateLookup({ repository = 'The-Connell-School/yawp', fetchFn = fetch, now = () => Date.now() / 1000 } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid preview repository');
  let snapshot = null;
  let fetchedAt = -Infinity;
  let pending = null;
  async function refresh() {
    const prs = new Map();
    try {
      for (let page = 1; page <= 10; page++) {
        const response = await fetchFn(`https://api.github.com/repos/${repository}/pulls?state=open&per_page=100&page=${page}`, {
          headers: { accept: 'application/vnd.github+json', 'user-agent': 'yawp-preview-ingress' },
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('GitHub unavailable');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid GitHub response');
        for (const pr of data) {
          if (pr.state === 'open' && Number.isSafeInteger(pr.number)) {
            prs.set(pr.number, { state: 'open', branch: String(pr.head?.ref || '').slice(0, 256), author: String(pr.user?.login || '').slice(0, 128) });
          }
        }
        if (data.length < 100) { snapshot = prs; return; }
      }
      throw new Error('Too many PR pages');
    } catch { snapshot = null; /* Fail closed; cache outages too to bound retries. */ }
    finally { fetchedAt = now(); }
  }
  return async (pr) => {
    if (!Number.isSafeInteger(pr) || pr < 1) return null;
    if (now() - fetchedAt >= 300) {
      if (!pending) pending = refresh().finally(() => { pending = null; });
      await pending;
    }
    return snapshot?.get(pr) || null;
  };
}

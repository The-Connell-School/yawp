// Deliberately conservative: link unfurlers, crawlers, monitors, and internal probes
// neither wake containers nor extend human idle deadlines.
const BOT_UA = /bot|crawler|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|discord|linkedin|pinterest|preview|headless|lighthouse|health.?check|kube-probe|kubelet|prometheus|uptime|monitor/i;
export function isBotRequest(request) {
  return BOT_UA.test(String(request.headers?.['user-agent'] || ''));
}
export function isHumanActivity(request) {
  if (isBotRequest(request) || /curl|wget|python-requests|go-http-client/i.test(String(request.headers?.['user-agent'] || ''))) return false;
  const pathname = String(request.url || '/').split('?')[0];
  if (/^\/__(?:wake|status)(?:\/|$)|^\/(?:api\/)?health(?:check|z)?(?:\/|$)|^\/(?:assets|build|static)\//i.test(pathname)) return false;
  if (request.method === 'POST' && /^\/(?:api|auth)(?:\/|$)/.test(pathname)) return true;
  return request.method === 'GET' && (
    String(request.headers?.accept || '').includes('text/html')
    || request.headers?.['sec-fetch-mode'] === 'navigate'
  );
}
export function createWakeLimiter({ perPrSeconds = 60, perIpHour = 10, globalHour = 20, credentialedHour = 10, now = () => Date.now() / 1000 } = {}) {
  for (const value of [perPrSeconds, perIpHour, globalHour, credentialedHour]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Wake limits must be positive integers');
  }
  const prs = new Map();
  const ips = new Map();
  const globals = new Map();
  return {
    take(pr, ip, { credentialed = false } = {}) {
      const budget = credentialed ? 'credentialed' : 'anonymous';
      const ipKey = `${budget}:${ip}`;
      const at = now();
      for (const [key, time] of prs) if (at - time >= perPrSeconds) prs.delete(key);
      for (const [key, times] of ips) {
        const live = times.filter(time => at - time < 3600);
        if (live.length) ips.set(key, live); else ips.delete(key);
      }
      const global = (globals.get(budget) || []).filter(time => at - time < 3600);
      const times = ips.get(ipKey) || [];
      if (prs.has(pr)) return Math.ceil(perPrSeconds - (at - prs.get(pr)));
      if (times.length >= perIpHour) return Math.ceil(3600 - (at - times[0]));
      if (global.length >= (credentialed ? credentialedHour : globalHour)) return Math.ceil(3600 - (at - global[0]));
      prs.set(pr, at); ips.set(ipKey, [...times, at]); globals.set(budget, [...global, at]);
      return 0;
    },
  };
}

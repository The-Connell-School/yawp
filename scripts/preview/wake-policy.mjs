// Deliberately conservative: link unfurlers, crawlers, monitors, and internal probes
// neither wake containers nor extend human idle deadlines.
const BOT_UA = /bot|crawler|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|discord|linkedin|pinterest|preview|headless|lighthouse|health.?check|kube-probe|kubelet|prometheus|uptime|monitor|curl|wget|python-requests|go-http-client/i;
export function isBotRequest(request) {
  return BOT_UA.test(String(request.headers?.['user-agent'] || ''));
}
export function isHumanActivity(request) {
  if (isBotRequest(request)) return false;
  const pathname = String(request.url || '/').split('?')[0];
  if (/^\/__(?:wake|status)(?:\/|$)|^\/(?:api\/)?health(?:check|z)?(?:\/|$)|^\/(?:assets|build|static)\//i.test(pathname)) return false;
  if (request.method === 'POST' && /^\/(?:api|auth)(?:\/|$)/.test(pathname)) return true;
  return request.method === 'GET' && (
    String(request.headers?.accept || '').includes('text/html')
    || request.headers?.['sec-fetch-mode'] === 'navigate'
  );
}
export function createWakeLimiter({ perPrSeconds = 60, perIpHour = 10, globalHour = 30, now = () => Date.now() / 1000 } = {}) {
  for (const value of [perPrSeconds, perIpHour, globalHour]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Wake limits must be positive integers');
  }
  const prs = new Map();
  const ips = new Map();
  let global = [];
  return {
    take(pr, ip) {
      const at = now();
      for (const [key, time] of prs) if (at - time >= perPrSeconds) prs.delete(key);
      for (const [key, times] of ips) {
        const live = times.filter(time => at - time < 3600);
        if (live.length) ips.set(key, live); else ips.delete(key);
      }
      global = global.filter(time => at - time < 3600);
      const times = ips.get(ip) || [];
      if (prs.has(pr)) return Math.ceil(perPrSeconds - (at - prs.get(pr)));
      if (times.length >= perIpHour) return Math.ceil(3600 - (at - times[0]));
      if (global.length >= globalHour) return Math.ceil(3600 - (at - global[0]));
      prs.set(pr, at); ips.set(ip, [...times, at]); global.push(at);
      return 0;
    },
  };
}

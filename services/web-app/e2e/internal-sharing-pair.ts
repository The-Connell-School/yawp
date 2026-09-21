import assert from 'node:assert/strict';
import { constants, openSync, fstatSync, readFileSync, closeSync, lstatSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

type Pair = { origin: string; token: string; ticketId: string; organizationId: string; seatFile: string };
export function readSharingPair(): Pair | null {
  const path = process.env.YAWP_SHARING_PAIR_CONFIG;
  if (!path) return null;
  assert(isAbsolute(path), 'Pair configuration must be absolute');
  const file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let value: Pair;
  try {
    const stat = fstatSync(file);
    assert(stat.isFile() && stat.size < 16000 && stat.uid === process.getuid!() && (stat.mode & 0o077) === 0, 'Pair configuration must be private');
    value = JSON.parse(readFileSync(file, 'utf8'));
  } finally { closeSync(file); }
  const url = new URL(value.origin);
  assert(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash, 'Pair API must be local');
  assert(/^[A-Za-z0-9_-]{43}$/.test(value.token) && /^[a-f0-9-]{36}$/.test(value.ticketId));
  assert(/^preview-seat-[1-9][0-9]{5,7}$/.test(value.organizationId));
  assert(value.seatFile === join(dirname(path), 'host', 'previews', `env-${value.ticketId}`, 'access-seats.json'));
  for (const directory of [dirname(path), join(dirname(path), 'host'), join(dirname(path), 'host', 'previews'), dirname(value.seatFile)]) {
    const stat = lstatSync(directory);
    assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid!() && (stat.mode & 0o022) === 0);
  }
  return value;
}
export async function discloseSharingPair(pair: Pair, code: string): Promise<string> {
  assert(code !== 'calm-otter-1111');
  writeFileSync(pair.seatFile, JSON.stringify([
    { organizationId: 'local-dev-org', label: 'Master', code: 'calm-otter-1111' },
    { organizationId: pair.organizationId, label: 'Paired test seat', code },
  ]), { mode: 0o600, flag: 'wx' });
  const endpoint = `${pair.origin}/api/tickets/${pair.ticketId}/preview/seats`;
  const headers = { authorization: `Bearer ${pair.token}`, 'content-type': 'application/json' };
  assert((await fetch(endpoint, { signal: AbortSignal.timeout(20000) })).status === 401);
  const inventory = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20000) });
  assert(inventory.ok, 'Internal must list the registered seat');
  const listed = await inventory.json();
  assert(listed.seats.length === 1 && listed.seats[0].organizationId === pair.organizationId && !('code' in listed.seats[0]));
  const reveal = (organizationId: string) => fetch(`${endpoint}/reveal`, { method: 'POST', headers, body: JSON.stringify({ organizationId }), signal: AbortSignal.timeout(20000) });
  assert((await reveal('local-dev-org')).status === 400);
  assert((await reveal('preview-seat-2')).status === 403);
  const response = await reveal(pair.organizationId);
  assert(response.ok && response.headers.get('cache-control') === 'no-store', 'Internal must explicitly disclose the scoped seat');
  const result = await response.json();
  assert(result.seat.organizationId === pair.organizationId && result.seat.code === code, 'Host receipt must match the owned Yawp seat');
  return result.seat.code;
}

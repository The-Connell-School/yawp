#!/usr/bin/env bun
/* eslint-disable no-console */
import https from 'node:https';
import { spawnSync } from 'node:child_process';

type WatchArgs = {
  minutes: number;
  errorThreshold: number;
  server5xxThreshold: number;
  org: string;
  flag: string;
};

function parseArgs(): WatchArgs {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const minutes = Number(get('--minutes') || '10');
  const errorThreshold = Number(get('--error-threshold') || '5');
  const server5xxThreshold = Number(get('--server5xx-threshold') || '10');
  const org = get('--org') || '';
  const flag = get('--flag') || '';
  if (!org || !flag) {
    console.error('Usage: bun scripts/release-gate/canary/watch --minutes 10 --error-threshold 5 --server5xx-threshold 10 --org <ORG_ID> --flag <FLAG_NAME>');
    process.exit(2);
  }
  return { minutes, errorThreshold, server5xxThreshold, org, flag };
}

function fetchJson({ hostname, path, headers }: { hostname: string; path: string; headers: Record<string, string | undefined> }) {
  return new Promise<{ statusCode?: number; body: any }>((resolve, reject) => {
    const req = https.request({ method: 'GET', hostname, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body || '{}') });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function countPostHogErrors(minutes: number): Promise<number> {
  const project = process.env.POSTHOG_PROJECT_ID || '';
  const host = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/^https?:\/\//, '');
  const token = process.env.POSTHOG_API_KEY || '';
  if (!project || !token) {
    console.warn('PostHog not configured (POSTHOG_PROJECT_ID/POSTHOG_API_KEY). Skipping error watch.');
    return 0;
    }
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  // Heuristic: count $exception events in the interval
  const path = `/api/projects/${project}/events/?event=$exception&after=${encodeURIComponent(since)}&limit=100`;
  const { statusCode, body } = await fetchJson({
    hostname: host,
    path,
    headers: {
      'User-Agent': 'yawp-release-gate',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (statusCode !== 200) {
    console.warn('PostHog events API returned', statusCode);
    return 0;
  }
  const count = Array.isArray(body?.results) ? body.results.length : 0;
  return count;
}

function getAws5xx(minutes: number): number {
  // Optional best-effort using AWS CLI if available
  if (!process.env.AWS_REGION || !process.env.APP_RUNNER_SERVICE_ARN) {
    console.warn('AWS not configured (AWS_REGION/APP_RUNNER_SERVICE_ARN). Skipping 5xx watch.');
    return 0;
  }
  const end = Math.floor(Date.now() / 1000);
  const start = end - minutes * 60;
  const res = spawnSync('aws', [
    'cloudwatch',
    'get-metric-statistics',
    '--namespace',
    'AWS/AppRunner',
    '--metric-name',
    '5xx',
    '--statistics',
    'Sum',
    '--period',
    String(minutes * 60),
    '--start-time',
    new Date(start * 1000).toISOString(),
    '--end-time',
    new Date(end * 1000).toISOString(),
    '--dimensions',
    `Name=ServiceArn,Value=${process.env.APP_RUNNER_SERVICE_ARN}`,
    '--region',
    process.env.AWS_REGION,
  ], { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    console.warn('AWS CLI failed; skipping 5xx watch.');
    return 0;
  }
  try {
    const out = JSON.parse(res.stdout || '{}');
    const points = out.Datapoints || [];
    const latest = points.sort((a: any, b: any) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime())[0];
    return Number(latest?.Sum || 0);
  } catch {
    return 0;
  }
}

function disableFlag(org: string, flag: string) {
  const res = spawnSync('bun', ['scripts/release-gate/canary/disable-flag.ts', '--org', org, '--flag', flag], { stdio: 'inherit' });
  if (res.error) throw res.error;
  return res.status ?? 0;
}

async function main() {
  const { minutes, errorThreshold, server5xxThreshold, org, flag } = parseArgs();
  console.log(`Watching ${minutes}m: PostHog errors <= ${errorThreshold}, App Runner 5xx <= ${server5xxThreshold}`);
  const errs = await countPostHogErrors(minutes);
  const fives = getAws5xx(minutes);
  console.log(`Observed: errors=${errs}, server5xx=${fives}`);
  if (errs > errorThreshold || fives > server5xxThreshold) {
    console.error('Threshold exceeded — rolling back flag.');
    disableFlag(org, flag);
    process.exit(2);
  }
  console.log('Stable — no rollback triggered.');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});


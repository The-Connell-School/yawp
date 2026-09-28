#!/usr/bin/env bun
/* eslint-disable no-console */
import { spawnSync } from 'node:child_process';

function run(cmd: string, args: string[]) {
  const res = spawnSync(cmd, args, { stdio: 'inherit' });
  if (res.error) throw res.error;
  return res.status ?? 0;
}

function main() {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const org = get('--org') || get('-o');
  const flag = get('--flag') || get('-f');
  if (!org || !flag) {
    console.error('Usage: bun scripts/release-gate/canary/disable-flag --org <ORG_ID> --flag <FLAG_NAME>');
    process.exit(2);
  }
  const code = run('bun', ['scripts/release-gate/canary/enable-flag.ts', '--org', org, '--flag', flag, '--value', 'false']);
  process.exit(code);
}

main();


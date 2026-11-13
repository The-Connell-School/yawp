#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { logPrefixedScriptError } from './log-script-error.mjs';
import { probeAnonymousDevLoginBlocked } from './smoke-login.mjs';

async function main() {
  const baseUrl = (process.argv[2] || '').replace(/\/$/, '');
  if (!baseUrl) {
    console.error(
      'Usage: assert-anonymous-dev-login-blocked.mjs <preview-base-url>'
    );
    process.exitCode = 1;
    return;
  }

  try {
    await probeAnonymousDevLoginBlocked(baseUrl);
  } catch (error) {
    logPrefixedScriptError(
      'POST /auth/dev-login without an access cookie is not acceptably blocked:',
      error
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

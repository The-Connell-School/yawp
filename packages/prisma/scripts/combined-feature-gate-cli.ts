#!/usr/bin/env bun

import {
  type CombinedFeatureGateScript,
  runCombinedFeatureGate,
} from './combined-feature-gate';

const scriptName = process.argv[2] as CombinedFeatureGateScript | undefined;
const allowedScripts = new Set<CombinedFeatureGateScript>([
  'combined-feature-preflight.sql',
  'combined-feature-postcheck.sql',
]);

if (!scriptName || !allowedScripts.has(scriptName)) {
  console.error(
    'Usage: bun combined-feature-gate-cli.ts combined-feature-preflight.sql|combined-feature-postcheck.sql'
  );
  process.exit(1);
}

try {
  await runCombinedFeatureGate(scriptName, process.env);
} catch (error) {
  console.error(`${scriptName} failed:`, error);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Read the first preview seat code from a host-local access-seats.json file.
 * Used by CI over SSH so deploy logs never need to carry code values.
 */
import { readFileSync } from 'node:fs';

const seatsPath = process.argv[2];
if (!seatsPath) {
  console.error('usage: read-smoke-access-code-from-seats-file.mjs <access-seats.json>');
  process.exit(2);
}

let seats;
try {
  seats = JSON.parse(readFileSync(seatsPath, 'utf8'));
} catch {
  console.error('failed to read preview access seats file');
  process.exit(1);
}

if (!Array.isArray(seats) || seats.length === 0) {
  console.error('preview access seats file is empty or invalid');
  process.exit(1);
}

const code = String(seats[0]?.code ?? '').trim();
if (!code) {
  console.error('preview access seats file has no smoke access code');
  process.exit(1);
}

process.stdout.write(code);

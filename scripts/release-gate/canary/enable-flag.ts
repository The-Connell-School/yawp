#!/usr/bin/env bun
/* eslint-disable no-console */
import { PrismaClient } from '@app/prisma';

type Args = {
  org: string;
  flag: string;
  value: boolean;
};

const ALLOWED_FLAGS = new Set([
  'writingPracticeEnabled',
  'reporterEnabled',
  'classInsightsEnabled',
  'revisionFlowEnabled',
  'submissionActivityEnabled',
]);

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const org = get('--org') || get('-o');
  const flag = get('--flag') || get('-f');
  const valueStr = get('--value') || get('-v') || 'true';
  if (!org || !flag) {
    console.error('Usage: bun scripts/release-gate/canary/enable-flag --org <ORG_ID> --flag <FLAG_NAME> [--value true|false]');
    process.exit(2);
  }
  if (!ALLOWED_FLAGS.has(flag)) {
    console.error(`Invalid flag: ${flag}. Allowed: ${Array.from(ALLOWED_FLAGS).join(', ')}`);
    process.exit(2);
  }
  const value = /^true$/i.test(valueStr);
  return { org, flag, value };
}

async function main() {
  const { org, flag, value } = parseArgs();
  const db = new PrismaClient();
  try {
    const updated = await db.organization.update({
      where: { id: org },
      data: { [flag]: value } as any,
      select: { id: true, name: true, [flag]: true } as any,
    });
    console.log(JSON.stringify({ ok: true, updated }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});


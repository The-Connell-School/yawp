import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { PrismaClient } from '../../../packages/prisma/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { InternalScenarios } from '../app/utils/internal-scenario.server';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const targetSchema = z.object({ targetId: id, environment: z.enum(['preview', 'demo']), organizationId: id,
  seatOrganizationIds: z.array(z.string().regex(/^preview-seat-(?:[2-9]|[1-9][0-9]+)$/)).max(99).optional(),
  databaseUrl: z.string().url(), revision: z.string().regex(/^[a-f0-9]{40}$/).optional() }).strict().refine(target => target.seatOrganizationIds === undefined ||
  (target.environment === 'preview' && new Set(target.seatOrganizationIds).size === target.seatOrganizationIds.length && !target.seatOrganizationIds.includes(target.organizationId)), 'Invalid preview seat registration');
const configSchema = z.object({ targets: z.array(targetSchema).min(1).max(1000) }).strict();
let db: InstanceType<typeof PrismaClient> | undefined;
try {
  const configPath = process.env.SCENARIO_CONFIG || '/etc/yawp-internal/scenarios.json';
  if (!isAbsolute(configPath)) throw new Error('Absolute configuration path required');
  const file = await open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let config: z.infer<typeof configSchema>;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1_000_000 || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid!()) throw new Error('Private operator configuration required');
    config = configSchema.parse(JSON.parse(await file.readFile('utf8')));
  } finally { await file.close(); }
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 16384) throw new Error('Input too large');
  }
  const request = JSON.parse(input);
  const matches = config.targets.filter(t => t.targetId === request?.target?.id && t.environment === request?.target?.environment);
  if (matches.length !== 1) throw new Error('Unknown or ambiguous target');
  const target = matches[0]!;
  if (target.environment === 'preview' && (!target.revision || target.revision !== request.target.revision)) throw new Error('Preview revision does not match registration');
  const organizationId = request.target.organizationId ?? target.organizationId;
  if (organizationId !== target.organizationId && !(target.environment === 'preview' && target.seatOrganizationIds?.includes(organizationId))) throw new Error('Seat is not registered');
  const database = new URL(target.databaseUrl);
  // The executable can only reach the dedicated local preview cluster, never RDS/production.
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      !['localhost', '127.0.0.1', 'yawp-internal-preview-postgres'].includes(database.hostname) ||
      !/^\/yawp_[a-zA-Z0-9_-]+$/.test(database.pathname) || database.search || database.hash) throw new Error('Nonproduction database required');
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.databaseUrl, ssl: false }) });
  const service = new InternalScenarios(db, { targetId: target.targetId, environment: target.environment, organizationId });
  const receipt = await service.apply(request);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
} catch {
  // Neither database URLs nor request payloads may reach worker logs.
  process.stderr.write('Scenario application failed\n');
  process.exitCode = 1;
} finally { await db?.$disconnect(); }

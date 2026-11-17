import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { featureFlagPrismaTables } from '~/domain/feature-flags/feature-flags.server.test-support';
import { EXIT_TICKET_GRADING_V2_FLAG } from './exit-ticket-grading-v2-flag';

const prisma = featureFlagPrismaTables();
mock.module('~/utils/db.server', () => ({ prisma }));

const { isExitTicketGradingV2RolloutEnabled } = await import(
  './exit-ticket-grading-v2-gate.server'
);
const { isFeatureFlagEnabled } = await import(
  '~/domain/feature-flags/feature-flags.server'
);

describe('isExitTicketGradingV2RolloutEnabled', () => {
  const previous = process.env.YAWP_ENVIRONMENT;

  beforeEach(() => {
    prisma.setting.findUnique.mockReset().mockResolvedValue(null);
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = previous;
  });

  test('fails closed on production with no Setting row', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    expect(await isExitTicketGradingV2RolloutEnabled()).toBe(false);
    expect(await isFeatureFlagEnabled(EXIT_TICKET_GRADING_V2_FLAG)).toBe(false);
  });

  test('defaults on for demo and preview', async () => {
    for (const environment of ['demo', 'preview']) {
      process.env.YAWP_ENVIRONMENT = environment;
      expect(await isExitTicketGradingV2RolloutEnabled()).toBe(true);
    }
  });

  test('honors everyone mode on production', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"everyone","orgIds":[]}',
    });
    expect(await isExitTicketGradingV2RolloutEnabled()).toBe(true);
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({
      where: { name: 'feature_flag.exit-ticket-grading-v2' },
      select: { value: true },
    });
  });
});
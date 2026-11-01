import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { featureFlagPrismaTables } from '~/domain/feature-flags/feature-flags.server.test-support';

const prisma = featureFlagPrismaTables();
mock.module('~/utils/db.server', () => ({ prisma }));

const { getAssignmentTypeLandingFlags } = await import(
  './landing-page-gate.server'
);

const V2 = 'feature_flag.assignment-type-landing-v2';
const THESIS = 'feature_flag.assignment-type-landing-thesis-essay';
const EVERYONE = '{"mode":"everyone","orgIds":[]}';

function stored(values: Record<string, string>) {
  prisma.setting.findUnique.mockImplementation(
    async (args: { where: { name: string } }) =>
      values[args.where.name] ? { value: values[args.where.name] } : null
  );
}

describe('assignment-type landing page gate', () => {
  const previous = process.env.YAWP_ENVIRONMENT;

  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    prisma.setting.findUnique.mockReset();
    process.env.YAWP_ENVIRONMENT = 'production';
  });

  test('is dark on production with no Setting rows', async () => {
    stored({});
    expect(await getAssignmentTypeLandingFlags('org-1')).toEqual({
      v2: false,
      thesisEssay: false,
    });
  });

  test('the Thesis-Driven Essay page needs the v2 flag too', async () => {
    stored({ [THESIS]: EVERYONE });
    expect(await getAssignmentTypeLandingFlags('org-1')).toEqual({
      v2: false,
      thesisEssay: false,
    });
    stored({ [V2]: EVERYONE });
    expect(await getAssignmentTypeLandingFlags('org-1')).toEqual({
      v2: true,
      thesisEssay: false,
    });
    stored({ [V2]: EVERYONE, [THESIS]: EVERYONE });
    expect(await getAssignmentTypeLandingFlags('org-1')).toEqual({
      v2: true,
      thesisEssay: true,
    });
  });

  test('is on in demo, where Brian reviews it', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    stored({});
    expect(await getAssignmentTypeLandingFlags('org-1')).toEqual({
      v2: true,
      thesisEssay: true,
    });
    if (previous === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = previous;
  });
});

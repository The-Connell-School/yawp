import type { PrismaClient } from '../../generated/prisma';

/** Create-only: a later operator OFF must survive subsequent demo seeds. */
export async function ensureDemoFeedbackEnabled(
  prisma: Pick<PrismaClient, 'setting'>,
  env: NodeJS.ProcessEnv = process.env
) {
  if ((env.PREVIEW_SLUG || env.YAWP_ENVIRONMENT) !== 'demo')
    return { skipped: true as const };
  await prisma.setting.upsert({
    where: { name: 'feature_flag.demo-feedback-widget' },
    create: {
      name: 'feature_flag.demo-feedback-widget',
      value: JSON.stringify({ mode: 'everyone', orgIds: [] }),
      valueType: 'json',
      description: 'Started on for demo feedback',
    },
    update: {},
  });
  return { enabled: true as const };
}

import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { FREE_TIER_ANALYTICS_EVENTS } from './posthog-analytics.server';
const recipe = await Bun.file(
  resolve(
    import.meta.dir,
    '../../../../../docs/free-tier/posthog-first-100-dashboard.json'
  )
).json();
test('dashboard recipe matches the stable events, supports organic entry and isolates the target', () => {
  expect(recipe.format).toBe('yawp-operator-recipe');
  expect(recipe.installation_status).toBe('repository_definition_only');
  expect(recipe.events.map((event: any) => event.event)).toEqual(
    Object.values(FREE_TIER_ANALYTICS_EVENTS)
  );
  const funnels = recipe.insights.filter((i: any) => i.type === 'funnel');
  expect(funnels[0].steps[0].event).toBe('free_tier.signup');
  expect(funnels[1].steps[0].event).toBe('free_tier.scan');
  for (const funnel of funnels)
    for (const step of funnel.steps)
      expect(Object.values(FREE_TIER_ANALYTICS_EVENTS)).toContain(step.event);
  const counter = recipe.insights.find((i: any) => i.type === 'sql');
  expect(counter.query).toContain(
    'uniqExact(toString(properties.teacher_user_id))'
  );
  expect(counter.query).toContain("properties.environment = 'production'");
  expect(counter.target).toBe(100);
});

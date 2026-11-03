import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { FreeTierSetupTimelineCard } from './free-tier-setup-timeline-card';

describe('FreeTierSetupTimelineCard', () => {
  test('marks class setup as the current step during class preparation', () => {
    const html = renderToStaticMarkup(
      <FreeTierSetupTimelineCard phase="class-setup" />
    );
    expect(html).toContain('set up your classroom');
    expect(html).toContain('Administrator approval');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('data-testid="free-tier-setup-timeline-card"');
  });

  test('marks administrator approval as the current step on the admin form', () => {
    const html = renderToStaticMarkup(
      <FreeTierSetupTimelineCard phase="admin-approval" />
    );
    const currentSteps = html.match(/aria-current="step"/g) ?? [];
    expect(currentSteps).toHaveLength(1);
    expect(html).toContain('Administrator approval');
  });
});

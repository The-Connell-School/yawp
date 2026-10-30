import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FreeTierGettingStartedTimeline } from './free-tier-getting-started-timeline';

test('FreeTierGettingStartedTimeline uses vertical timeline markers, not primary radio fills', () => {
  const html = renderToStaticMarkup(
    <FreeTierGettingStartedTimeline
      title="Getting started"
      progressLabel="Step 2 of 4"
      testId="free-account-checklist"
      steps={[
        { key: 'a', label: 'Class ready', state: 'done' },
        { key: 'b', label: 'First assignment created', state: 'current' },
        { key: 'c', label: 'Add your students', state: 'upcoming' },
      ]}
    />
  );
  expect(html).toContain('data-testid="free-account-checklist"');
  expect(html).toContain('Step 2 of 4');
  expect(html).toContain('w-0.5 bg-border');
  expect(html).not.toContain('border-primary bg-primary');
  expect(html).toContain('border-emerald-800 bg-emerald-800');
});

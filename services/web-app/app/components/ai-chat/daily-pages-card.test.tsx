import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { DailyPagesCard } from './daily-pages-card';

function render(props: Partial<Parameters<typeof DailyPagesCard>[0]> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DailyPagesCard
        exercise={{ kind: 'class-starter', prompt: 'What do people avoid saying out loud?', promptId: null }}
        assignmentTypeId="daily_1"
        classStarterTypeId="starter_1"
        onToggle={() => {}}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('DailyPagesCard: buttons wrap their label (Kevin, Nov 21)', () => {
  test('the long Create label wraps instead of running past the card', () => {
    const html = render({ optionCard: true });
    expect(html).toContain('Create this Class Starter exercise for your class');
    expect(html).toMatch(/class="[^"]*btn--wrap[^"]*"[^>]*data-testid="daily-pages-create"/);
  });

  test('Add to lesson and Replace wrap too', () => {
    const html = render({ onReplace: () => {} });
    expect(html).toMatch(/class="[^"]*btn--wrap[^"]*"[^>]*data-testid="daily-pages-stack-toggle"/);
    expect(html).toMatch(/class="[^"]*btn--wrap[^"]*"[^>]*data-testid="daily-pages-replace"/);
  });
});

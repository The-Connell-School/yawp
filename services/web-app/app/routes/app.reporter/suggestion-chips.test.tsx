import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReporterSuggestionChips } from './suggestion-chips';

test('Reporter starter chips highlight white on hover and focus', () => {
  const html = renderToStaticMarkup(
    <ReporterSuggestionChips
      prompts={[
        {
          id: 'class-grade-report',
          label: 'Grade report for a class',
          prompt: 'Give me a grade report',
        },
        {
          id: 'needs-attention',
          label: 'Who needs attention?',
          prompt: 'Who needs attention?',
        },
      ]}
      onPick={() => {}}
      disabled={false}
    />
  );
  expect(html).toContain('Grade report for a class');
  expect(html).toContain('Who needs attention?');
  expect(html.match(/data-testid="reporter-suggestion-chip"/g)).toHaveLength(2);
  expect(html).toContain('hover:bg-white');
  expect(html).toContain('focus-visible:bg-white');
  expect(html).toContain('focus-visible:outline-none');
  expect(html).toContain('hover:shadow-[var(--lp-sheet-shadow)]');
});

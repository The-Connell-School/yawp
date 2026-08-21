import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GradeSummaryReleasedLabel } from './grade-summary-released-label';

describe('GradeSummaryReleasedLabel', () => {
  test('renders released text with stamp icon', () => {
    const html = renderToStaticMarkup(<GradeSummaryReleasedLabel />);

    expect(html).toContain('data-testid="grade-summary-released-label"');
    expect(html).toContain('Released');
    expect(html).toContain('lucide-badge-check');
  });
});

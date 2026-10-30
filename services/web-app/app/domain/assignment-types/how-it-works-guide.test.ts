import { describe, expect, test } from 'bun:test';
import { howItWorksGuideFor } from './how-it-works-guide';

describe('howItWorksGuideFor', () => {
  test('gives each guided type its own guide, however the title is cased', () => {
    expect(howItWorksGuideFor('The Thesis-Driven Essay')).toBe('thesis-essay');
    expect(howItWorksGuideFor('  daily pages ')).toBe('daily-pages');
    expect(howItWorksGuideFor('Class Starter')).toBe('class-starter');
  });

  test('has no guide for other assignment types', () => {
    expect(howItWorksGuideFor('The 5-Paragraph Essay')).toBeNull();
    expect(howItWorksGuideFor('Free Write')).toBeNull();
  });
});

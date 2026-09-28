import { describe, expect, test } from 'bun:test';

import { splitQuotedExample } from './composition-prompt';

describe('splitQuotedExample', () => {
  test('pulls a trailing quoted example out of its lead-in', () => {
    expect(
      splitQuotedExample(
        'Here’s a fence-sitting thesis: "Social media has both positive and negative effects on teenagers."'
      )
    ).toEqual({
      lead: 'Here’s a fence-sitting thesis:',
      quote:
        'Social media has both positive and negative effects on teenagers.',
    });
  });

  test('handles curly quotes and a mid-sentence colon lead', () => {
    expect(
      splitQuotedExample(
        'A classmate writes about skateboarding: “Everyone knows it’s great.”'
      )
    ).toEqual({
      lead: 'A classmate writes about skateboarding:',
      quote: 'Everyone knows it’s great.',
    });
  });

  test('returns no quote for scenarios without a trailing quotation', () => {
    expect(
      splitQuotedExample(
        'Think of one opinion you hold about skateboarding that a friend might push back on.'
      )
    ).toEqual({ lead: null, quote: null });
  });

  test('handles a bare quote with no lead-in', () => {
    expect(splitQuotedExample('"Homework is always a waste of time."')).toEqual(
      {
        lead: null,
        quote: 'Homework is always a waste of time.',
      }
    );
  });
});

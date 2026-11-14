import { describe, expect, test } from 'bun:test';
import { splitNumberedLead } from './body-format';

describe('splitNumberedLead', () => {
  test("a numbered rule's first sentence is its lead", () => {
    expect(splitNumberedLead('1. Protect your students. No names, photos, or details.')).toEqual({
      lead: '1. Protect your students.',
      rest: ' No names, photos, or details.',
    });
  });

  test('a lead can end with a question mark', () => {
    expect(splitNumberedLead('7. Something broken or wrong? Use the Contact Us button.')).toEqual({
      lead: '7. Something broken or wrong?',
      rest: ' Use the Contact Us button.',
    });
  });

  test('a lead with a comma keeps going to the full stop', () => {
    expect(splitNumberedLead('5. Vent if you need to, but lean toward solutions. Teaching is hard.')?.lead).toBe(
      '5. Vent if you need to, but lean toward solutions.'
    );
  });

  test('a rule that is one sentence is all lead', () => {
    expect(splitNumberedLead('2. Ask the question.')).toEqual({ lead: '2. Ask the question.', rest: '' });
  });

  test('lines that are not numbered have no lead', () => {
    expect(splitNumberedLead('A few things that keep this the good kind of faculty lounge:')).toBeNull();
    expect(splitNumberedLead('2026. A year.')).toBeNull();
    expect(splitNumberedLead('1. no full stop here')).toBeNull();
  });

  test('a lead holding a mention is left alone', () => {
    expect(splitNumberedLead('1. Ask @[Brian C.](user:abc) first. He knows.')).toBeNull();
  });
});

import { describe, expect, test } from 'bun:test';
import { brandParts, upperKeepingBrand } from './brand';

describe("the name in capitals (Brian, Oct 22: all caps is the logo's alone)", () => {
  test('capitals around it, Yawp! as written', () => {
    expect(upperKeepingBrand('Yawp! Lesson Plan · The critical essay')).toBe('Yawp! LESSON PLAN · THE CRITICAL ESSAY');
    expect(upperKeepingBrand('Open it in YAWP!')).toBe('OPEN IT IN Yawp!');
    expect(upperKeepingBrand('no name here')).toBe('NO NAME HERE');
  });
  test('the parts around the name', () => {
    expect(brandParts('The Yawp! Tutor')).toEqual([
      { text: 'The ', brand: false },
      { text: 'Yawp!', brand: true },
      { text: ' Tutor', brand: false },
    ]);
  });
});

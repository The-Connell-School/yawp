/**
 * The unit map at a glance (Kevin, Nov 23): a day's main activities as icons,
 * read from its own words. The examples are Kevin's Antigone unit.
 */
import { describe, expect, test } from 'bun:test';
import { shortReading, unitDayActivities } from './unit-day-activities';

describe('what a unit day’s students do, at a glance', () => {
  test('Day 1: no reading, a starter, teaching, a share, an exit ticket', () => {
    expect(
      unitDayActivities({
        reading: 'None — this day is entirely student-driven',
        students: "Class starter: 'Think of a rule you have followed even though you thought it was wrong.' Then: what do you already know about ancient Greece? Quick share, then direct teaching on Athens.",
        check: 'Exit ticket: In one sentence, what makes a law worth breaking?',
      })
    ).toEqual(['starter', 'teach', 'discuss', 'check']);
  });

  test('Day 3: a close reading and a paired debate, then a Short Response', () => {
    expect(
      unitDayActivities({
        reading: 'Antigone, Scene 1 — read aloud in class',
        students: "Class starter: 'When is loyalty to your country more important than loyalty to your family?' Close reading of Creon's speeches. Paired debate: argue Creon's side as strongly as you can.",
        check: 'Short Response: What is the strongest thing Creon says?',
      })
    ).toEqual(['starter', 'close', 'debate', 'write']);
  });

  test('Day 4: reading at home, a discussion, writing and a check, at most five', () => {
    const day = unitDayActivities({
      reading: 'Antigone, Odes 1 and 2 and Scene 3 — read for homework before class',
      students: "Class starter: 'If everyone around you agreed...' Discussion: what does the Chorus do that no single character can? Short Response: What does the Chorus fear?",
      check: 'Exit ticket: In your own words, what is the Chorus afraid of?',
    });
    expect(day).toEqual(['starter', 'read', 'discuss', 'write', 'check']);
  });

  test('a seminar is its own, with the gavel; its pairs and talk are part of it', () => {
    expect(unitDayActivities({ students: 'Socratic seminar, inner/outer circle; pairs prepare questions.', check: 'Seminar tracker' })).toEqual(['seminar']);
  });

  test('a day whose words name nothing gets nothing', () => {
    expect(unitDayActivities({ students: 'Students continue.' })).toEqual([]);
  });

  test('the reading, short enough for one line; none is none', () => {
    expect(shortReading('Antigone, Prologue and Parodos — read aloud in class')).toBe('Antigone, Prologue and Parodos');
    expect(shortReading('None — this day is entirely student-driven')).toBeNull();
    expect(shortReading(undefined)).toBeNull();
  });
});

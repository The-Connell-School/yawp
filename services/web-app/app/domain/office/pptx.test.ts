import { describe, expect, test } from 'bun:test';
import { hasSlideText, readPptxSlides } from './pptx';
import { readFixture } from './fixtures';

describe('readPptxSlides', () => {
  const slides = readPptxSlides(readFixture('deck.pptx'));

  test('numbers slides the way the teacher sees them, not the way they are filed', () => {
    // The fixture's presentation order is slide3, slide1, slide4, slide2 —
    // the deck was reordered after it was built, which is the ordinary case.
    // Reading it in filename order would make every slide number the planner
    // cites point at the wrong slide.
    expect(slides.map((slide) => slide.number)).toEqual([1, 2, 3, 4]);
    expect(slides[0]!.lines[0]).toBe('Evidence that earns its place');
    expect(slides[1]!.lines[0]).toBe('Why some quotes land');
    expect(slides[2]!.lines[0]).toBe('Which one makes you cringe?');
    expect(slides[3]!.lines[0]).toBe('Your turn');
  });

  test('joins the runs a slide is chopped into', () => {
    // PowerPoint splits a line across runs wherever formatting changes, so
    // "Which one makes you " and "cringe?" arrive separately.
    expect(slides[0]!.lines).toEqual([
      'Evidence that earns its place',
      'English 10 · Period 3',
    ]);
  });

  test('decodes escaped characters', () => {
    expect(slides[2]!.lines).toContain('"The author says" & friends');
  });

  test('breaks a line where the slide breaks it', () => {
    expect(slides[3]!.lines).toEqual([
      'Your turn',
      'Rewrite the weak version',
      'Four minutes',
    ]);
  });

  test('puts speaker notes on the slide they belong to', () => {
    // notesSlide1 belongs to slide4 and notesSlide2 to slide3 — PowerPoint
    // numbers notes parts in their own sequence, so following the numbers
    // instead of the relationships hands the teacher someone else's notes.
    expect(slides[0]!.notes).toBe('Set the stakes before naming the skill.');
    expect(slides[2]!.notes).toBe('Three silent minutes first.');
  });

  test('leaves notes empty for a slide that has none', () => {
    expect(slides[1]!.notes).toBe('');
    expect(slides[3]!.notes).toBe('');
  });

  test('does not read the slide-number placeholder as a note', () => {
    // The notes part also stores the footer's slide number field. Letting it
    // through means the planner reads a bare "3" as something a teacher wrote.
    expect(slides[0]!.notes).not.toContain('3');
  });

  test('says when a deck has text worth reading', () => {
    expect(hasSlideText(slides)).toBe(true);
    expect(hasSlideText([])).toBe(false);
    expect(hasSlideText([{ number: 1, lines: [], notes: '' }])).toBe(false);
  });
});

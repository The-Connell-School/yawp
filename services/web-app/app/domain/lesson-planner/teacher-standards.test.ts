import { describe, expect, test } from 'bun:test';
import { shortStandard, teacherStandards } from './teacher-standards';

describe('teacherStandards: only the standards the teacher named', () => {
  test('a Common Core code, however it is written', () => {
    expect(teacherStandards(['Plan a lesson on RL.9-10.1 for my sophomores.'])).toEqual(['RL.9-10.1']);
    expect(teacherStandards(['CCSS.ELA-LITERACY.W.11-12.2b please'])).toEqual(['W.11-12.2b']);
    expect(teacherStandards(['Hit ri.8.3 and RI.8.3 again'])).toEqual(['RI.8.3']);
  });

  test('a standard pasted in as text, after the word standard', () => {
    const named = teacherStandards([
      'Use this standard: "Cite strong and thorough textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text."',
    ]);
    expect(named).toEqual([
      'Cite strong and thorough textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text.',
    ]);
  });

  test('a code and its text together are one standard, the code first', () => {
    expect(
      teacherStandards(['The standard is RL.9-10.1: Cite strong and thorough textual evidence to support analysis.'])
    ).toEqual(['RL.9-10.1: Cite strong and thorough textual evidence to support analysis.']);
  });

  test('nothing named, nothing returned: never inferred', () => {
    expect(teacherStandards(['Day one of The Things They Carried, 50 minutes.', 'Make it about evidence.'])).toEqual([]);
    expect(teacherStandards(['Is this standard practice?'])).toEqual([]);
  });
});

describe('shortStandard', () => {
  test('a code stands for itself; text is cut to its opening words', () => {
    expect(shortStandard('RL.9-10.1: Cite strong and thorough textual evidence.')).toBe('RL.9-10.1');
    expect(shortStandard('W.11-12.2b')).toBe('W.11-12.2b');
    expect(shortStandard('Cite strong and thorough textual evidence to support analysis.')).toBe('Cite strong and thorough textual evidence to…');
  });
});

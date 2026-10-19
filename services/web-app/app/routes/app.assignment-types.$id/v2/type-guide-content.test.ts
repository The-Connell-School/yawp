import { expect, test } from 'bun:test';
import { typeGuideContent, moduleGuide, numberWord } from './type-guide-content';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
test('type variants and grammar-only rubric sentence', () => {
  expect(typeGuideContent({title:'The Thesis-Driven Essay'}, true).whatStudentsWrite).toContain('on an angle the student chooses');
  expect(typeGuideContent({title:'The Thesis-Driven Essay'}, true).howItsGraded).toContain('Grammar and syntax count');
  expect(typeGuideContent({title:'The Thesis-Driven Essay'}, false).howItsGraded).not.toContain('Grammar');
  for (const title of ['5-Paragraph Essay', 'Five Paragraph Essay']) {
    expect(typeGuideContent({title}, false).whatStudentsWrite).toContain('three body paragraphs');
    expect(typeGuideContent({title}, false).sparsePromptCopy).toContain('three supporting points');
  }
  expect(typeGuideContent({title:' Class Starter '}, true).gradingLabel).toBe('Graded on effort');
  expect(typeGuideContent({title:'Daily Pages'}, true).howItsGraded).toContain('5 or more');
  expect(typeGuideContent({title:'Daily Pages'}, true).howItsGraded).not.toContain('Grammar and syntax count');
  expect(typeGuideContent({title:'Other',kind:'exit_ticket'}, true).tutorOn).toBe(false);
  expect(typeGuideContent({title:'History',systemKey:AP_HISTORY_ASSIGNMENT_TYPE_KEY}, true).howItsGraded).toContain('all-or-nothing');
  expect(typeGuideContent({title:'Custom',description:'A paper'}, false).whatStudentsWrite).toBe('A paper');
  expect(typeGuideContent({title:'Custom'}, false).howItsGraded).toBe("The grading assistant scores each paper against the type's rubric.");
});
test.each([['Pre-Writing','Pre-writing'],['Thesis Statement','Thesis'],['Writing your Thesis Statement','Thesis'],['Introduction Paragraph','Introduction'],['Body Paragraphs','Body paragraphs'],['Conclusion Paragraph','Conclusion'],['Title your Essay','Title'],['Title Your Essay!','Title'],['Review My Essay!','Review']])('%s gets teacher label %s', (title,label) => {
  expect(moduleGuide(title).label).toBe(label);
  expect(moduleGuide(title).oneLiner).toBeTruthy();
});
test('unknown modules keep their title without a teacher one-liner; five paragraph body override', () => {
  expect(moduleGuide('Custom')).toEqual({label:'Custom',oneLiner:''});
  expect(moduleGuide('Body paragraphs',true).oneLiner).toStartWith('Three paragraphs');
  expect([1,7,12,13].map(numberWord)).toEqual(['One','Seven','Twelve','13']);
});

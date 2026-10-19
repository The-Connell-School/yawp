import { expect, test } from 'bun:test';
import { assignmentClassLabel, assignmentDueLabel, menuState } from './page-helpers';
test('all five menu states', () => {
  expect(menuState({hasClasses:true,library:true,generator:true,apHistory:false})).toBe('library-generator');
  expect(menuState({hasClasses:true,library:true,generator:false,apHistory:false})).toBe('library');
  expect(menuState({hasClasses:true,library:false,generator:false,apHistory:false})).toBe('plain');
  expect(menuState({hasClasses:false,library:true,generator:true,apHistory:true})).toBe('no-classes');
  expect(menuState({hasClasses:true,library:false,generator:false,apHistory:true})).toBe('ap-history');
});
test('class labels use periods only when every class has a period', () => {
  expect(assignmentClassLabel([{period:'2'}])).toBe('Period 2');
  expect(assignmentClassLabel([{period:'1'},{period:'3'}])).toBe('Periods 1 and 3');
  expect(assignmentClassLabel([{period:'1',title:'English'},{title:'Writing'}])).toBe('English, Writing');
  expect(assignmentClassLabel([])).toBe('');
});
test('earliest due date is formatted in teacher time zone', () => {
  expect(assignmentDueLabel(['2026-10-25T01:00:00Z',null,'2026-10-24T01:00:00Z'],'America/Los_Angeles')).toBe('Due Oct 23');
  expect(assignmentDueLabel([],'UTC')).toBe('');
});

import { expect, test } from 'bun:test';
import { libraryAdapter, collectionPage } from './library-adapter';
import { toLibraryEntries as thesisEntries, type ThesisPrompt } from '../thesis-prompts-library/data';
import thesis from '../thesis-prompts-library/prompts.json';
import { toLibraryEntries as freewriteEntries, type LibraryPrompt } from '../prompts-library/data';
import freewrite from '../prompts-library/prompts.json';
import { toLibraryEntries as shortEntries, type ShortFormPrompt } from '../short-form-prompts-library/data';
import short from '../short-form-prompts-library/prompts.json';
test('adapters retain facet params, labels, metadata and save routes', () => {
  expect(libraryAdapter('thesis').facets.map(f=>f.param)).toEqual(['tp_cat','tp_subjects','tp_texts','tp_moves','tp_source','tp_grades']);
  expect(libraryAdapter('thesis').saveAction).toBe('/api/domain/thesis-prompt-save');
  expect(libraryAdapter('freewrite').saveAction).toBe('/api/domain/daily-pages-prompt-save');
  expect(libraryAdapter('short-form').collectionParam).toBe('sf_coll');
  expect(libraryAdapter('thesis').card(thesisEntries(thesis as ThesisPrompt[])[0]).badge).toBeTruthy();
  expect(libraryAdapter('thesis').card(thesisEntries(thesis as ThesisPrompt[])[0]).meta).toContain('Grades 9, 10, 11, 12');
});
test('all corpora reuse pagination, Library default and My prompts', () => {
  for (const items of [thesisEntries(thesis as ThesisPrompt[]),freewriteEntries(freewrite as LibraryPrompt[]),shortEntries(short as ShortFormPrompt[])]) {
    const saved={...items[0],id:'saved',collection:'mine' as const};
    const mixed=[...items,saved];
    expect(collectionPage(mixed,null,null).items).toHaveLength(12);
    expect(collectionPage(mixed,null,'2').start).toBe(13);
    expect(collectionPage(mixed,'mine','999').items).toEqual([saved]);
    expect(collectionPage(mixed,'library','999').page).toBe(Math.ceil(items.length/12));
    expect(collectionPage(mixed,'library,mine','-2').total).toBe(items.length);
  }
});

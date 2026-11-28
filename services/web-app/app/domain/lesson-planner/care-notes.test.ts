import { describe, expect, it } from 'bun:test';
import { careNoteProblems, hardContentOf } from './care-notes';

describe('hardContentOf: the commonly taught works with content a class needs care with', () => {
  it('knows them by name in the request', () => {
    expect(hardContentOf(['Teach a 50-minute lesson for 11th grade on chapter 2 of Their Eyes Were Watching God, the pear tree.'])?.content).toContain('sexual violence');
    expect(hardContentOf(['Build day 1 of an Of Mice and Men unit for 10th grade'])?.content).toContain('slur');
    expect(hardContentOf(['Build day 1 of a Macbeth unit for 12th grade'])?.content).toContain('children');
    expect(hardContentOf(["Teach a close reading of 'Ozymandias'"])).toBeNull();
  });
});

describe('careNoteProblems (S7: care with hard content; Nov 28 fiction run)', () => {
  const asked = ['Teach a 50-minute lesson for 11th grade on chapter 2 of Their Eyes Were Watching God, the pear tree.'];
  it('finds a lesson on such a work with no care note (Their Eyes: no note, though chapter 2 holds Nanny\'s account of rape)', () => {
    const problems = careNoteProblems('# The pear tree\n\n## Read (15 min)\nRead the passage.', asked);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('Their Eyes Were Watching God');
    expect(problems[0]!.what).toContain('opt out');
    expect(problems[0]!.what).toContain('counselor');
    expect(problems[0]!.words).toBe('# The pear tree');
  });

  it('asks to complete a care note that says nothing about when to involve a counselor (Of Mice and Men)', () => {
    const reply = '# Into the Valley\n\n**Care note:** The novel uses a racial slur and ends in a death. Let students know on day 1; anyone may step out of the read-aloud.\n\n## Read (15 min)';
    const problems = careNoteProblems(reply, ['Build day 1 of an Of Mice and Men unit for 10th grade']);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.what).toContain('counselor');
  });

  it('is satisfied by a full care note, and asks nothing of a work not on the list', () => {
    const full = '# Into the Valley\n\n**Care note:** The novel uses a racial slur and ends in a death. Frame it on day 1; any student may opt out of the read-aloud; involve the school counselor if a student is distressed. Students never read the slur aloud.\n\n## Read';
    expect(careNoteProblems(full, ['Build day 1 of an Of Mice and Men unit for 10th grade'])).toEqual([]);
    expect(careNoteProblems('# Ozymandias\n\n## Read', ["Teach a close reading of 'Ozymandias'"])).toEqual([]);
  });
});

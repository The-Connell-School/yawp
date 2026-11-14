import { describe, expect, test } from 'bun:test';
import { groupByAssignmentType } from './group-by-assignment-type';

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

type Row = { id: string; type: { id: string; title: string } };
const row = (id: string, typeId: string, typeTitle: string): Row => ({
  id,
  type: { id: typeId, title: typeTitle },
});

describe('groupByAssignmentType', () => {
  test('one group per assignment type, keyed by type id and labelled by its title', () => {
    const groups = groupByAssignmentType({
      items: [
        row('a', 'exit', 'Exit Ticket'),
        row('b', 'daily', 'Daily Pages'),
        row('c', 'exit', 'Exit Ticket'),
      ],
      getAssignmentType: (item) => item.type,
      collator,
    });

    expect(groups.map(({ key, label, items }) => [key, label, items.map((i) => i.id)])).toEqual([
      ['daily', 'Daily Pages', ['b']],
      ['exit', 'Exit Ticket', ['a', 'c']],
    ]);
  });

  test('orders groups by title the way the Documents page orders its groups, numbers included', () => {
    const groups = groupByAssignmentType({
      items: [
        row('1', 't10', 'Unit 10 essay'),
        row('2', 't2', 'Unit 2 essay'),
        row('3', 'tl', 'the Thesis-Driven Essay'),
        row('4', 'ta', 'ACT Writing Section'),
      ],
      getAssignmentType: (item) => item.type,
      collator,
    });
    expect(groups.map((group) => group.label)).toEqual([
      'ACT Writing Section',
      'the Thesis-Driven Essay',
      'Unit 2 essay',
      'Unit 10 essay',
    ]);
  });

  test('keeps the incoming order of rows inside a group, so the table sort still applies', () => {
    const groups = groupByAssignmentType({
      items: [row('z', 'x', 'X'), row('a', 'x', 'X'), row('m', 'x', 'X')],
      getAssignmentType: (item) => item.type,
      collator,
    });
    expect(groups[0].items.map((item) => item.id)).toEqual(['z', 'a', 'm']);
  });

  test('two types that share a title stay separate groups, in a stable order', () => {
    const groups = groupByAssignmentType({
      items: [
        row('1', 'org-b', 'Production QA Writing'),
        row('2', 'org-a', 'Production QA Writing'),
      ],
      getAssignmentType: (item) => item.type,
      collator,
    });
    expect(groups.map((group) => group.key)).toEqual(['org-a', 'org-b']);
  });

  test('no items, no groups', () => {
    expect(
      groupByAssignmentType({
        items: [] as Row[],
        getAssignmentType: (item) => item.type,
        collator,
      })
    ).toEqual([]);
  });
});

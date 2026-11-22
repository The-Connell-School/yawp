import { describe, expect, test } from 'bun:test';
import { kitMenu, visualKitFor, WORK_VISUAL_KITS, type WorkVisual } from './work-visuals';

const USES: WorkVisual['use'][] = ['author', 'setting', 'period', 'person', 'scene', 'object', 'edition'];

/** Kits with no author picture: no known author, or no free portrait. */
const NO_AUTHOR_PORTRAIT = new Set<string>(['beowulf']);

describe('work-visuals: the kits', () => {
  test('every kit has a unique id, a title and an author line', () => {
    const ids = WORK_VISUAL_KITS.map((kit) => kit.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kit of WORK_VISUAL_KITS) {
      expect(kit.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(kit.title.trim()).not.toBe('');
      expect(kit.author.trim()).not.toBe('');
    }
  });

  test('every kit has match strings: non-empty, lower-case, trimmed, no repeats', () => {
    for (const kit of WORK_VISUAL_KITS) {
      expect(kit.match.length).toBeGreaterThan(0);
      expect(new Set(kit.match).size).toBe(kit.match.length);
      for (const match of kit.match) {
        expect(match.trim()).not.toBe('');
        expect(match).toBe(match.trim());
        expect(match).toBe(match.toLowerCase());
      }
    }
  });

  test('every match string finds its own kit, so no two kits answer to the same name', () => {
    for (const kit of WORK_VISUAL_KITS) {
      for (const match of kit.match) {
        expect({ match, kit: visualKitFor(match)?.id }).toEqual({ match, kit: kit.id });
      }
    }
  });

  test('at most one author picture in a kit, and it comes first', () => {
    for (const kit of WORK_VISUAL_KITS) {
      const authors = kit.visuals.filter((visual) => visual.use === 'author');
      expect({ kit: kit.id, authors: authors.length <= 1 }).toEqual({ kit: kit.id, authors: true });
      if (authors.length === 1) expect({ kit: kit.id, first: kit.visuals[0]?.use }).toEqual({ kit: kit.id, first: 'author' });
      expect({ kit: kit.id, noPortrait: authors.length === 0 }).toEqual({ kit: kit.id, noPortrait: NO_AUTHOR_PORTRAIT.has(kit.id) });
    }
  });

  test('no subject repeats within a kit, and every picture says what it shows and what it is for', () => {
    for (const kit of WORK_VISUAL_KITS) {
      const subjects = kit.visuals.map((visual) => visual.subject);
      expect({ kit: kit.id, unique: new Set(subjects).size }).toEqual({ kit: kit.id, unique: subjects.length });
      for (const visual of kit.visuals) {
        expect(visual.subject.trim()).not.toBe('');
        expect(visual.subject).toBe(visual.subject.trim());
        expect(visual.shows.trim()).not.toBe('');
        expect(USES).toContain(visual.use);
      }
    }
  });

  test('five to nine pictures after the author', () => {
    for (const kit of WORK_VISUAL_KITS) {
      const count = kit.visuals.filter((visual) => visual.use !== 'author').length;
      expect({ kit: kit.id, enough: count >= 5, notTooMany: count <= 9 }).toEqual({ kit: kit.id, enough: true, notTooMany: true });
    }
    for (const id of NO_AUTHOR_PORTRAIT) {
      expect(WORK_VISUAL_KITS.some((kit) => kit.id === id)).toBe(true);
    }
  });

  test('an entry not yet checked against Wikipedia says so, and comes after the checked ones', () => {
    for (const kit of WORK_VISUAL_KITS) {
      for (const visual of kit.visuals) {
        expect(visual.unchecked === undefined || visual.unchecked === true).toBe(true);
      }
      // The author stays first either way; after it, checked before unchecked.
      const rest = kit.visuals.filter((visual) => visual.use !== 'author').map((visual) => visual.unchecked === true);
      const firstUnchecked = rest.indexOf(true);
      const lastChecked = rest.lastIndexOf(false);
      expect({ kit: kit.id, ordered: firstUnchecked === -1 || lastChecked < firstUnchecked }).toEqual({ kit: kit.id, ordered: true });
    }
  });

  test('no picture is described as a map, flag, logo, chart, film still, film poster or modern cover', () => {
    for (const kit of WORK_VISUAL_KITS) {
      for (const visual of kit.visuals) {
        expect(`${kit.id}: ${visual.shows}`).not.toMatch(/\b(map|flag|logo|coat of arms|chart|diagram|film still|film poster|movie)\b/i);
      }
    }
  });

  test('the most-taught works are all there', () => {
    const requests: Array<[string, string]> = [
      ['Macbeth', 'macbeth'],
      ['Hamlet', 'hamlet'],
      ['Romeo and Juliet', 'romeo-and-juliet'],
      ['Julius Caesar', 'julius-caesar'],
      ['Othello', 'othello'],
      ["A Midsummer Night's Dream", 'a-midsummer-nights-dream'],
      ['The Odyssey', 'the-odyssey'],
      ['The Great Gatsby', 'the-great-gatsby'],
      ['To Kill a Mockingbird', 'to-kill-a-mockingbird'],
      ['Of Mice and Men', 'of-mice-and-men'],
      ['The Grapes of Wrath', 'the-grapes-of-wrath'],
      ['1984', 'nineteen-eighty-four'],
      ['Animal Farm', 'animal-farm'],
      ['Lord of the Flies', 'lord-of-the-flies'],
      ['The Crucible', 'the-crucible'],
      ['Death of a Salesman', 'death-of-a-salesman'],
      ['A Raisin in the Sun', 'a-raisin-in-the-sun'],
      ['Their Eyes Were Watching God', 'their-eyes-were-watching-god'],
      ['Things Fall Apart', 'things-fall-apart'],
      ['Night by Elie Wiesel', 'night'],
      ['The Scarlet Letter', 'the-scarlet-letter'],
      ['Frankenstein', 'frankenstein'],
      ['Pride and Prejudice', 'pride-and-prejudice'],
      ['Jane Eyre', 'jane-eyre'],
      ['Great Expectations', 'great-expectations'],
      ['A Tale of Two Cities', 'a-tale-of-two-cities'],
      ['Adventures of Huckleberry Finn', 'huckleberry-finn'],
      ['The Catcher in the Rye', 'the-catcher-in-the-rye'],
      ['Fahrenheit 451', 'fahrenheit-451'],
      ['Brave New World', 'brave-new-world'],
      ['Beowulf', 'beowulf'],
      ['The Canterbury Tales', 'the-canterbury-tales'],
      ['Heart of Darkness', 'heart-of-darkness'],
      ['The Outsiders', 'the-outsiders'],
      ['The Giver', 'the-giver'],
      ['Narrative of the Life of Frederick Douglass', 'frederick-douglass-narrative'],
      ['Letter from Birmingham Jail', 'letter-from-birmingham-jail'],
      ['Anthem for Doomed Youth', 'wilfred-owen'],
      ['Emily Dickinson', 'emily-dickinson'],
      ['The Negro Speaks of Rivers', 'langston-hughes'],
      ['Robert Frost', 'robert-frost'],
      ['Walt Whitman', 'walt-whitman'],
      ['The Tell-Tale Heart', 'edgar-allan-poe'],
      ["Shakespeare's sonnets", 'shakespeares-sonnets'],
      ['The Things They Carried', 'the-things-they-carried'],
      ['Antigone', 'sophocles'],
      ['Oedipus Rex', 'sophocles'],
      ['The Diary of a Young Girl', 'anne-frank'],
    ];
    for (const [request, id] of requests) {
      expect({ request, kit: visualKitFor(`Teach a lesson on ${request} for 10th grade`)?.id }).toEqual({ request, kit: id });
    }
    expect(new Set(requests.map(([, id]) => id)).size).toBe(WORK_VISUAL_KITS.length);
  });

  test('works about atrocity carry no camp, victim or violence pictures: those are the teacher’s choice', () => {
    for (const id of ['night', 'anne-frank']) {
      const kit = WORK_VISUAL_KITS.find((candidate) => candidate.id === id)!;
      for (const visual of kit.visuals) {
        expect(`${id}: ${visual.subject} ${visual.shows}`).not.toMatch(
          /auschwitz|birkenau|buchenwald|bergen|belsen|westerbork|camp\b|ghetto|deport|corpse|bod(y|ies)|massacre|yellow (badge|star)|selection/i
        );
      }
    }
    for (const kit of WORK_VISUAL_KITS) {
      for (const visual of kit.visuals) {
        expect(`${kit.id}: ${visual.subject} ${visual.shows}`).not.toMatch(/lynch/i);
      }
    }
  });
});

describe('work-visuals: visualKitFor', () => {
  test('finds the work in a teacher’s request', () => {
    expect(visualKitFor("Teach a 50-minute lesson for 12th grade on Hamlet's 'To be, or not to be' soliloquy")?.id).toBe('hamlet');
    expect(visualKitFor('Build day 1 of a unit on Night by Elie Wiesel for 10th grade')?.id).toBe('night');
    expect(visualKitFor("a close reading of Wilfred Owen's 'Dulce et Decorum Est'")?.id).toBe('wilfred-owen');
    expect(visualKitFor('Teach chapter 1 of The Great Gatsby')?.id).toBe('the-great-gatsby');
    expect(visualKitFor('Langston Hughes\'s poem "Mother to Son"')?.id).toBe('langston-hughes');
  });

  test('finds the work in a deck title, whatever its case and punctuation', () => {
    expect(visualKitFor('MACBETH — Act 2, Scene 2: “Sleep no more”')?.id).toBe('macbeth');
    expect(visualKitFor('Elie Wiesel’s Night: Moishe the Beadle')?.id).toBe('night');
    expect(visualKitFor('Dulce et Decorum Est: the old lie')?.id).toBe('wilfred-owen');
    expect(visualKitFor('Tim O’Brien, “On the Rainy River”')?.id).toBe('the-things-they-carried');
    expect(visualKitFor('To Kill a Mockingbird, chapters 17–21: the trial')?.id).toBe('to-kill-a-mockingbird');
    expect(visualKitFor('Poe’s “The Raven”')?.id).toBe('edgar-allan-poe');
    expect(visualKitFor('Sonnet 130 and the blazon')?.id).toBe('shakespeares-sonnets');
  });

  test('null when the request names no work', () => {
    expect(visualKitFor('a writing lesson on thesis statements')).toBeNull();
    expect(visualKitFor('')).toBeNull();
    expect(visualKitFor('   ')).toBeNull();
    expect(visualKitFor('Friday night football and the personal narrative')).toBeNull();
  });

  test('"night" inside another title or word is never Wiesel’s Night', () => {
    expect(visualKitFor("A Midsummer Night's Dream")?.id).toBe('a-midsummer-nights-dream');
    expect(visualKitFor("Teach Act 3 of A Midsummer Night's Dream for 9th grade")?.id).not.toBe('night');
    expect(visualKitFor('a lesson on imagery: midnight, twilight and night in three poems')).toBeNull();
    expect(visualKitFor("Robert Frost's Acquainted with the Night")?.id).toBe('robert-frost');
  });

  test('whole words only', () => {
    expect(visualKitFor('hamlets and villages of medieval England')).toBeNull();
    expect(visualKitFor('Macbethian ambition')).toBeNull();
  });

  test('the longest name wins when a request names more than one work', () => {
    // Frost's poem read inside The Outsiders is a lesson on The Outsiders.
    expect(visualKitFor("Ponyboy recites Robert Frost in The Outsiders, chapter 5")?.id).toBe('the-outsiders');
    expect(visualKitFor('Pair A Raisin in the Sun with Langston Hughes')?.id).toBe('a-raisin-in-the-sun');
  });
});

describe('work-visuals: kitMenu', () => {
  test('lists every picture, one a line, as subject, what it shows and its use', () => {
    for (const kit of WORK_VISUAL_KITS) {
      const lines = kitMenu(kit).split('\n');
      expect(lines.length).toBe(kit.visuals.length);
      kit.visuals.forEach((visual, index) => {
        expect(lines[index]).toBe(`- ${visual.subject} — ${visual.shows} (${visual.use})`);
      });
    }
  });

  test('the author comes first in the menu', () => {
    const hamlet = visualKitFor('Hamlet')!;
    expect(kitMenu(hamlet).split('\n')[0]).toMatch(/^- William Shakespeare — .+ \(author\)$/);
  });
});

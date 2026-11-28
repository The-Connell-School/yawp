import { describe, expect, it } from 'bun:test';
import { GENRES, genreRulesSection, readGenre, type Genre } from './genre-rules';

describe('readGenre: which kind of lesson a request is (rules by genre, Nov 28)', () => {
  // The eleven requests of the Nov 24 types test, word for word.
  const requests: Array<[string, Genre]> = [
    ['Teach a 50-minute writing lesson for 10th grade on writing a counterclaim and rebuttal in an argument essay. Include the slide deck.', 'writing'],
    ['Build day 1 of a Macbeth unit for 12th grade, 50 minutes: introduce the play and read Act 1, Scene 1 together. Include the slide deck.', 'play'],
    ['Teach a 50-minute lesson for 9th grade on using semicolons correctly in their own writing. Include the slide deck.', 'grammar'],
    ["Teach a 50-minute lesson for 11th grade on Frederick Douglass's 'Learning to Read and Write' (chapter 7 of his Narrative). Include the slide deck.", 'memoir'],
    ['Build day 1 of an Of Mice and Men unit for 10th grade, 50 minutes: introduce the novel and read the opening of chapter 1. Include the slide deck.', 'novel'],
    ["Teach a 50-minute close reading of Percy Bysshe Shelley's 'Ozymandias' for 10th grade. Include the slide deck.", 'poem'],
    ['Teach a 50-minute lesson for 11th grade on evaluating sources for a research paper. Include the slide deck.', 'research'],
    ['Plan a 50-minute Socratic seminar for 10th grade on Lord of the Flies after students finish the novel. Include the slide deck.', 'seminar'],
    ["Teach a 50-minute rhetorical analysis lesson for 11th grade on Lincoln's Gettysburg Address. Include the slide deck.", 'speech'],
    ["Teach a 50-minute lesson for 9th grade on Guy de Maupassant's short story 'The Necklace'. Include the slide deck.", 'story'],
    ["Build a unit plan for 11th grade: a three-week nonfiction unit on Frederick Douglass's Narrative, 50-minute periods, ending in an argument essay.", 'unit'],
  ];
  for (const [request, genre] of requests) {
    it(`${genre}: ${request.slice(0, 60)}…`, () => expect(readGenre([request])).toBe(genre));
  }

  it('knows common works by name when the request does not say the genre', () => {
    expect(readGenre(['Help me teach chapter 3 of The Great Gatsby'])).toBe('novel');
    expect(readGenre(['Hamlet, the "to be or not to be" soliloquy, for seniors'])).toBe('play');
    expect(readGenre(['A lesson on "We Real Cool" by Gwendolyn Brooks'])).toBe('poem');
    expect(readGenre(["Teach Martin Luther King Jr.'s Letter from Birmingham Jail"])).toBe('speech');
  });

  it('reads the earlier messages when the latest says nothing about the genre', () => {
    expect(readGenre(['Now the handout', 'Teach a 50-minute close reading of a sonnet by Shakespeare.'])).toBe('poem');
  });

  it('is null when it cannot tell: the planner then gets the rules for every lesson only', () => {
    expect(readGenre(['Help me plan tomorrow'])).toBeNull();
    expect(readGenre([])).toBeNull();
  });
});

describe('genreRulesSection: the genre\'s own set for the planner', () => {
  it('has a set for every genre, each with its own rules', () => {
    for (const genre of GENRES) {
      const lines = genreRulesSection(genre).join('\n');
      expect(lines).toContain('THIS LESSON IS');
      expect(lines.length).toBeGreaterThan(200);
    }
  });

  it('gives fiction its own rules: meet the people first, no spoilers, device and effect (novel)', () => {
    const novel = genreRulesSection('novel').join('\n');
    expect(novel).toContain('Meet the people first');
    expect(novel).toContain('No spoilers');
    expect(novel).toContain('Name the device, ask its effect');
    expect(novel).toContain('never what they want or are like');
  });

  it('a poem is heard twice and printed whole, and gets the world slides only when place or time is the meaning', () => {
    const poem = genreRulesSection('poem').join('\n');
    expect(poem).toContain('heard at least twice');
    expect(poem).toContain('printed whole');
    expect(poem).toContain('at most ten minutes of context');
  });

  it('switches off the rules that made the test lesson worse, by name', () => {
    const seminar = genreRulesSection('seminar').join('\n');
    expect(seminar).toContain('Do not apply here');
    expect(seminar).toContain('the slides are the questions, without pictures');
    const grammar = genreRulesSection('grammar').join('\n');
    expect(grammar).toContain('Do not apply here');
    expect(grammar).toContain('world slide');
    expect(grammar).toContain('wrong-and-right pairs');
  });

  it('rewords the general rules a skill lesson reads differently (the arc, access, the visual)', () => {
    const writing = genreRulesSection('writing').join('\n');
    expect(writing).toContain('Compose live');
    expect(writing).toContain("students' own experience of the move");
    expect(writing).toContain('sentence frames');
    const research = genreRulesSection('research').join('\n');
    expect(research).toContain('Real sources in hand');
    expect(research).toContain('[the class\'s research topic]');
  });
});

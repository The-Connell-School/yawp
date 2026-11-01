import { describe, expect, test } from 'bun:test';

import {
  LANDING_PAGES,
  type LandingBlock,
  type LandingPage,
  type LandingPageKey,
  enabledLandingPageKey,
  landingPagePlainText,
  resolveLandingPageKey,
} from './content';

function page(key: LandingPageKey): LandingPage {
  return LANDING_PAGES[key];
}

function section(key: LandingPageKey, id: string) {
  const found = page(key).sections.find((s) => s.id === id);
  if (!found) throw new Error(`${key} has no section ${id}`);
  return found;
}

function paragraphs(blocks: LandingBlock[]): string[] {
  return blocks.flatMap((block) =>
    block.type === 'paragraph' ? [block.text] : []
  );
}

function bullets(blocks: LandingBlock[]): string[] {
  return blocks.flatMap((block) => (block.type === 'bullets' ? block.items : []));
}

describe('resolveLandingPageKey', () => {
  test.each([
    [{ title: 'The Thesis-Driven Essay' }, 'thesis-driven-essay'],
    [{ title: '  the thesis-driven essay ' }, 'thesis-driven-essay'],
    [{ title: 'Class Starter', kind: 'class_starter' }, 'class-starter'],
    [{ title: 'Class Starter' }, 'class-starter'],
    [{ title: 'Exit Ticket', kind: 'exit_ticket' }, 'exit-ticket'],
    [{ title: 'Prewriting', kind: 'prewriting' }, 'prewriting'],
    [{ title: 'Thesis Statement', kind: 'thesis_statement' }, 'thesis-statement'],
    [{ title: 'Daily Pages', kind: 'daily_pages' }, 'daily-pages'],
    [{ title: 'AP History Essays', systemKey: 'ap_history_essay' }, 'ap-history'],
    [{ title: 'The 5-Paragraph Essay' }, 'five-paragraph-essay'],
    [{ title: 'ACT Writing Section ' }, 'act-writing'],
    [{ title: 'Welcome to Yawp! ' }, 'welcome-to-yawp'],
  ] as const)('%o resolves to %s', (type, key) => {
    expect(resolveLandingPageKey(type)).toBe(key);
  });

  test('school-authored and unknown types keep the old page', () => {
    expect(resolveLandingPageKey({ title: "GBA 300: Int'l Expansion Plan" })).toBeNull();
    expect(resolveLandingPageKey({ title: 'Nonverbal Communication Assignment' })).toBeNull();
    // Free Write is the student's own space, not something a teacher assigns.
    expect(resolveLandingPageKey({ title: 'Free Write', kind: 'free_write' })).toBeNull();
  });
});

describe('enabledLandingPageKey', () => {
  test('nothing is new while the v2 flag is off', () => {
    expect(enabledLandingPageKey('class-starter', { v2: false, thesisEssay: true })).toBeNull();
  });
  test('the Thesis-Driven Essay waits for its own flag', () => {
    expect(
      enabledLandingPageKey('thesis-driven-essay', { v2: true, thesisEssay: false })
    ).toBeNull();
    expect(
      enabledLandingPageKey('thesis-driven-essay', { v2: true, thesisEssay: true })
    ).toBe('thesis-driven-essay');
    expect(enabledLandingPageKey('exit-ticket', { v2: true, thesisEssay: false })).toBe(
      'exit-ticket'
    );
  });
  test('an unknown type stays unknown', () => {
    expect(enabledLandingPageKey(null, { v2: true, thesisEssay: true })).toBeNull();
  });
});

describe("Brian's pages, word for word", () => {
  test('The Thesis-Driven Essay', () => {
    expect(paragraphs(page('thesis-driven-essay').description)).toEqual([
      'The Thesis-Driven Essay is the big one: the grown-up essay that stands up in any high school or college classroom. Complex thesis statements, well-built arguments, conclusions that go beyond restating the main idea, and writing any reader will enjoy (even you, grading your 79th essay). Use it in any subject or class — it works everywhere!',
    ]);
    const howToTeach = section('thesis-driven-essay', 'how-to-teach-it');
    expect(howToTeach.heading).toBe('How to Teach It');
    expect(paragraphs(howToTeach.blocks)).toEqual([
      'The Yawp! process is what we wish someone had shown us in our first year teaching. Teach the steps below in order. Each has a lesson stack (slides and handouts you can teach as is or edit) and a short tutorial video. Whether this is your first year or your twentieth, watch each video before you teach that lesson (at least the first time through). This is a step-by-step process, and going in order makes the difference: how students find a focus, develop a thesis, and build body paragraphs that actually prove it.',
    ]);
    // The course card: each lesson with its lesson plan and slide deck.
    expect(howToTeach.blocks).toContainEqual({
      type: 'course',
      lead: '**Teach these steps in order! (Did we mention that?)**',
    });
    expect(paragraphs(section('thesis-driven-essay', 'prompt-library').blocks)).toEqual([
      'Have your own prompt? Click **New** above to create it in the Assignment Builder. Or choose one from our library: filter by subject, text, or grade level, click a prompt, and edit it however you like in the Assignment Builder.',
    ]);
    // Brian: the note goes at the top of the library itself, not with the
    // explanation above it.
    expect(page('thesis-driven-essay').libraryNote).toBe(
      "**Note:** We've found that students write their best essays about something they actually care about, so many of our prompts are open on purpose and encourage students to choose their own adventure within a topic. You'll enjoy reading 75 essays with 75 different angles a lot more than 75 essays answering the same narrow question. Still, some students and teachers prefer a tighter, more specific scope, and that's OK too! Either way, help students find their personal connection to the topic. If a student is stuck, send them to the emotional charge: what they loved, what grabbed them, what made them upset."
    );
    expect(landingPagePlainText(page('thesis-driven-essay'))).not.toContain('Note:');
    expect(page('thesis-driven-essay').library).toBe('thesis');
  });

  test('Class Starter', () => {
    expect(paragraphs(page('class-starter').description)).toEqual([
      "The Class Starter is the easiest way to get every student writing every day. 5–10 minutes at the start of class — one open prompt and no pressure about grammar or polish. Regular low-stakes writing builds critical thinking, as well as confidence, so students feel ready when you assign the big essay. Use it as a warm-up, a reaction to last night's reading, or a way to hear from the kid who never raises their hand.",
    ]);
    expect(section('class-starter', 'how-it-works').heading).toBe('How it works');
    expect(paragraphs(section('class-starter', 'how-it-works').blocks)).toEqual([
      'Click **New** above to write a prompt, or pick one from the Prompt Library below.',
      '**Tutor on or off?** You choose in the Assignment Builder. With the tutor on, students get feedback on what they wrote and encouragement to write a little more. It will never write for them. Turn it off when you just want them writing on their own.',
      '**Grading is about effort.** Any real attempt earns full credit, a thin one earns partial credit, and a blank page earns none.',
    ]);
    expect(paragraphs(section('class-starter', 'prompt-library').blocks)).toEqual([
      'Need an idea to get students thinking? Browse the library!',
    ]);
    expect(page('class-starter').libraryNote).toBeNull();
    expect(page('class-starter').library).toBe('open-ended');
  });

  test('Exit Ticket', () => {
    expect(paragraphs(page('exit-ticket').description)).toEqual([
      "The Exit Ticket tells you whether today's lesson landed. A few minutes at the end of class for students to show they understand a concept, reflect on what you just did, or ask a lingering question. Use students’ responses to plan your next lesson.",
    ]);
    const how = section('exit-ticket', 'how-it-works');
    expect(how.blocks).toEqual([
      { type: 'paragraph', text: 'Click **New** above and choose a type:' },
      {
        type: 'bullets',
        items: [
          "**Reflection/Question:** students tell you what they learned, what surprised them, or what they're still wondering.",
          "**Check for understanding:** name the idea you're checking and let students explain it. You can set the correct answer or key points in the Assignment Builder.",
        ],
      },
      {
        type: 'paragraph',
        text: '**Tutor off or on?** It starts off, because an exit ticket shows what students understand on their own. Turn it on for a class that tends to hand in six words. It will ask them to say more without giving away the answer or writing for them.',
      },
      {
        type: 'paragraph',
        text: "**Grading is optional.** Set it for an easy grade or leave it ungraded if you just want to see who got it and who didn't.",
      },
    ]);
    const good = section('exit-ticket', 'what-makes-a-good-one');
    expect(good.heading).toBe('What makes a good exit ticket');
    expect(bullets(good.blocks)).toEqual([
      '**Ask for one thing.** Three questions get three shallow answers.',
      '**Ask them to explain, not recall.** "Define the term post-modern hero" shows who memorized a sentence. "Point to one specific detail/moment of chapter 4 that shows this character is a post-modern hero" shows who understood.',
      "**Read them before you plan tomorrow.** If read quickly, an exit ticket can change tomorrow's lesson.",
    ]);
    expect(page('exit-ticket').library).toBeNull();
  });

  test('Exit Ticket is a couple hundred words, down from about 1,300', () => {
    const words = landingPagePlainText(page('exit-ticket')).split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(150);
    expect(words.length).toBeLessThan(260);
  });

  test('Pre-Writing', () => {
    expect(page('prewriting').description).toEqual([
      {
        type: 'paragraph',
        text: '**Step 1 of the Yawp! writing process.** Start here, before students write a word of their essay.',
      },
      {
        type: 'paragraph',
        text: 'Pre-writing may be the most important — and most overlooked — part of the writing process. Most students skip straight from the prompt to the essay, and it shows. They end up sorting out their ideas in the essay itself, which can result in a big, hot, rambling mess. Pre-writing is where students figure out what they actually think about the topic or prompt...*before they write their essay.* We promise: the writing they do before the actual writing of their essays will greatly improve the quality of their finished products (and the quality of your reading/grading experience)!',
      },
    ]);
    expect(section('prewriting', 'when-to-use-it').heading).toBe('When to use it');
    expect(paragraphs(section('prewriting', 'when-to-use-it').blocks)).toEqual([
      "Give students the essay prompt, and before they start writing the essay, let them pre-write. They're allowed to be messy as they explore ideas, ask questions, and eventually find a focus for their essay.",
      'After this, move on to Thesis Statement (Step 2), where students turn their focus into a clear, arguable claim.',
    ]);
    expect(paragraphs(section('prewriting', 'how-it-works').blocks)).toEqual([
      'Click **New** above to write a prompt, or pick one from the Prompt Library below.',
      '**First time teaching it?** Watch the short tutorial video before class. It walks you through this step of the Yawp! writing process and comes with a ready-to-teach lesson (slides and handouts) you can use as is or edit.',
      '**Tutor on or off?** With the tutor on, students get immediate feedback as they write: questions that push their thinking so they can develop original ideas. It will never write for them. This is one of the steps where the Tutor really shines and will save you, the teacher, a lot of time. Turn it off if you want to see how students do on their own.',
      '**Grading is on the focus and the thinking behind it.** Once students find their focus, they label it at the bottom of the page and submit their document to you. You can see everything they wrote and any chat they had with the Tutor. The Grading Assistant looks at the focus and the pre-writing that led to it. This is about critical thinking, not grammar or polish.',
    ]);
    expect(paragraphs(section('prewriting', 'prompt-library').blocks)).toEqual([
      'Have your own prompt to get students going? Click **New** above. Or choose one from our library: filter by subject, text, or grade level, click a prompt, and edit it however you like in the Assignment Builder.',
      "**Note:** We've found that students write their best essays about something they actually care about, so many of our prompts are open on purpose and let students choose their own adventure within a topic. That's exactly what pre-writing is for. Still, some students and teachers prefer a tighter, more specific scope, and that's OK too! Either way, help students find their personal connection to the topic. If a student is stuck, send them to the emotional charge: what they loved, what grabbed them, what made them upset.",
    ]);
    // Reuses the Thesis-Driven Essay library rather than building a new one.
    expect(page('prewriting').library).toBe('thesis');
  });

  test('Thesis Statement', () => {
    expect(paragraphs(page('thesis-statement').description)).toEqual([
      '**Step 2 of the Yawp! writing process.** Note: Before you ask students to write a thesis statement, we highly recommend letting them pre-write on your prompt (Step 1).',
      "The classic three-part thesis of the five-paragraph essay is a great place to start with younger writers, and it's easy enough to teach. What we’re teaching here takes it to a higher level: a more complex thesis for a more complex essay. In one class period, students turn an observation and an analysis into one clear, arguable sentence. It's the heart of Yawp!'s Thesis-Driven Essay as a standalone assignment, so students can practice it with any text or topic.",
    ]);
    expect(paragraphs(section('thesis-statement', 'when-to-use-it').blocks)).toEqual([
      'After students pre-write on a prompt and have found a specific focus for their essays, students use this assignment to develop complex, beautiful thesis statements that will drive their essays.',
      'Depending on your students and goals, you might also use this assignment on its own to give students practice developing strong thesis statements (but we recommend pre-writing first).',
    ]);
    expect(paragraphs(section('thesis-statement', 'how-it-works').blocks)).toEqual([
      'Click **New** above and use the same essay prompt students pre-wrote on.',
      '**First time teaching it?** Watch the short tutorial video before class. It walks you through this step of the Yawp! writing process and comes with a ready-to-teach lesson (slides and handouts) you can use as is or edit.',
      "**Tutor on or off?** With the tutor on, students get immediate feedback as they shape their thesis: what's working, what's missing, and how to sharpen it. It will never write the thesis for them. This is one of the steps where the Tutor really shines and will save you, the teacher, a lot of time. Turn it off if you want to see how students do on their own.",
      '**Grading is on the thesis alone.** Students type their thesis on the page and submit the document to you, and the Grading Assistant judges that one sentence.',
    ]);
    const strong = section('thesis-statement', 'what-makes-a-strong-thesis');
    expect(strong.heading).toBe('What makes a strong thesis');
    expect(strong.blocks).toEqual([
      {
        type: 'bullets',
        items: [
          "**It's one sentence.** If it needs two, the idea (or the wording) isn't focused yet.",
          "**It's specific.** Students often think they need to cover a lot of ground to fill the pages. Great thesis statements narrow in, allowing the essay to go deep.",
          '**It pairs observation with analysis.** What students noticed, plus what it means.',
          "**It takes a position someone could disagree with.** A great thesis starts a debate: it's a claim the student has to explain, defend, and qualify across a whole essay.",
        ],
      },
      {
        type: 'paragraph',
        text: '**Weak:** "Romeo and Juliet is a play about love and hate."',
      },
      {
        type: 'paragraph',
        text: "It's one sentence, but that's all it has going for it. It's broad, it only observes, and no one would argue with it.",
      },
      {
        type: 'paragraph',
        text: '**Strong:** "In Romeo and Juliet, the adults\' refusal to end their feud—not fate—dooms the young lovers, suggesting that pride passed between generations is more dangerous than any star-crossed destiny."',
      },
      {
        type: 'paragraph',
        text: 'One sentence. Specific: the adults\' feud. Observation: the feud, not fate, dooms the lovers. Analysis: pride passed between generations is the real danger. Arguable, since the play itself calls the lovers "star-crossed."',
      },
    ]);
    // Teachers use the same prompt students pre-wrote on.
    expect(page('thesis-statement').library).toBeNull();
    expect(page('thesis-statement').sections.map((s) => s.id)).not.toContain('prompt-library');
  });
});

describe('every page', () => {
  const keys = Object.keys(LANDING_PAGES) as LandingPageKey[];

  test.each(keys)('%s always writes the brand as "Yawp!"', (key) => {
    const text = landingPagePlainText(page(key)) + (page(key).libraryNote ?? '');
    expect(text).not.toMatch(/Yawp(?!!)/);
  });

  test.each(keys)('%s leads with a description and no heading for it', (key) => {
    expect(page(key).description.length).toBeGreaterThan(0);
    expect(page(key).key).toBe(key);
  });

  test.each(keys)('%s points teachers at New, or Create assignment for AP History', (key) => {
    const text = landingPagePlainText(page(key));
    expect(text).toContain(key === 'ap-history' ? 'Create assignment' : 'New');
  });

  test('only multi-step essays list their steps; one-step types have no Modules block', () => {
    const blockTypes = (key: LandingPageKey) =>
      page(key).sections.flatMap((s) => s.blocks.map((b) => b.type));
    const withSteps = keys.filter((key) => blockTypes(key).includes('steps'));
    expect(withSteps.sort()).toEqual(
      (['act-writing', 'five-paragraph-essay'] as LandingPageKey[]).sort()
    );
    // Only the Thesis-Driven Essay has the course, with lesson plans and decks.
    expect(keys.filter((key) => blockTypes(key).includes('course'))).toEqual([
      'thesis-driven-essay',
    ]);
  });

  test('a page with a library has a Prompt Library section, and one without does not', () => {
    for (const key of keys) {
      const hasSection = page(key).sections.some((s) => s.id === 'prompt-library');
      expect({ key, hasSection }).toEqual({ key, hasSection: page(key).library !== null });
    }
  });
});

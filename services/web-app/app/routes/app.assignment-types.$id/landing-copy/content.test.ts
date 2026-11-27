import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANDING_PAGES,
  type LandingBlock,
  type LandingPage,
  type LandingPageKey,
  enabledLandingPageKey,
  landingPageFor,
  landingPageHeading,
  landingPagePlainText,
  resolveLandingPageKey,
  stepDescription,
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
    // Renamed Short Response (Brian, Nov 15). The type's own title may follow.
    [{ title: 'Short Response', kind: 'daily_pages' }, 'daily-pages'],
    [{ title: ' short response ' }, 'daily-pages'],
    [{ title: 'AP History Essays', systemKey: 'ap_history_essay' }, 'ap-history'],
    [{ title: 'The 5-Paragraph Essay' }, 'five-paragraph-essay'],
    [{ title: 'C-E-R', kind: 'claim_evidence_reasoning' }, 'cer-paragraph'],
    [{ title: 'C-E-R' }, 'cer-paragraph'],
    [{ title: ' The CER Paragraph ' }, 'cer-paragraph'],
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
      'The Yawp! process is what we wish someone had shown us in our first year teaching. Teach the steps below in order. Each has a slide deck and a short tutorial video. Whether this is your first year or your twentieth, watch each video before you teach that lesson (at least the first time through). This is a step-by-step process, and going in order makes the difference: how students find a focus, develop a thesis, and build body paragraphs that actually prove it.',
    ]);
    // The course card: each lesson with its lesson plan and slide deck.
    expect(howToTeach.blocks).toContainEqual(
      expect.objectContaining({
        type: 'course',
        lead: '**Teach these steps in order! (Did we mention that?)**',
      })
    );
    // Kevin and Brian, Nov 11: no loose paragraphs between the sections. The
    // library intro moves to the top of the library itself. Kevin, Nov 15:
    // Brian's note is its own box under How to Teach It, above the library,
    // as on the Pre-Writing page (it was under the Pre-writing lesson's row).
    expect(page('thesis-driven-essay').sections.map((s) => s.id)).toEqual([
      'how-to-teach-it',
      'philosophy',
    ]);
    expect(page('thesis-driven-essay').libraryNote).toBe(
      'Have your own prompt? Click **New** above to create it in the Assignment Builder. Or choose one from our library: filter by subject, text, or grade level, click a prompt, and edit it however you like in the Assignment Builder.'
    );
    const philosophy = section('thesis-driven-essay', 'philosophy');
    expect(philosophy.heading).toBe('Yawp! philosophy on essay prompts');
    expect(paragraphs(philosophy.blocks)).toEqual([
      "We've found that students write their best essays about something they actually care about, so many of our prompts are open on purpose and encourage students to choose their own adventure within a topic. You'll enjoy reading 75 essays with 75 different angles a lot more than 75 essays answering the same narrow question. Still, some students and teachers prefer a tighter, more specific scope, and that's OK too! Either way, help students find their personal connection to the topic. If a student is stuck, send them to the emotional charge: what they loved, what grabbed them, what made them upset.",
    ]);
    // Nothing under a lesson's row any more: the course card is the lessons.
    expect(howToTeach.blocks).toContainEqual({
      type: 'course',
      lead: '**Teach these steps in order! (Did we mention that?)**',
    });
    expect(landingPagePlainText(page('thesis-driven-essay'))).not.toContain('Note:');
    expect(landingPagePlainText(page('thesis-driven-essay'))).toContain(
      'Yawp! philosophy on essay prompts'
    );
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
      '**Grading is about effort.** Use these three bands:',
    ]);
    expect(bullets(section('class-starter', 'how-it-works').blocks)).toEqual([
      '**Full credit:** Any real attempt.',
      '**Partial credit:** A thin attempt.',
      '**No credit:** A blank page.',
    ]);
    // Nov 11: the library intro sits at the top of the library, not loose
    // under the How it works box.
    expect(page('class-starter').sections.map((s) => s.id)).toEqual(['how-it-works']);
    expect(page('class-starter').libraryNote).toBe(
      'Need an idea to get students thinking? Browse the library!'
    );
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

  test('Pre-Writing (Kevin and Brian, Nov 11)', () => {
    expect(paragraphs(section('prewriting', 'how-to-teach-it').blocks)).toEqual([
      'Pre-writing is the first step of any major essay assignment. Download the slide deck, and watch the short tutorial video before you teach it.',
    ]);
    expect(page('prewriting').description).toEqual([
      {
        type: 'paragraph',
        text: '**Step one of the critical essay writing process.** Start here, before students write a word of their essay.',
      },
      {
        type: 'paragraph',
        text: 'Pre-writing may be the most important (and most overlooked) part of the writing process. Most students skip straight from the prompt to the essay, and it shows. They end up sorting out their ideas in the essay itself, which can result in a big, hot, rambling mess. Pre-writing is where students figure out what they actually think about the topic or prompt...*before they write their essay.* We promise: the writing they do before the actual writing of their essays will greatly improve the quality of their finished products (and the quality of your reading/grading experience)!',
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
      '**Grading is on the focus and the critical thinking behind it.** Once students find their focus, they label it at the bottom of the page and submit their document to you. You can see everything they wrote and any chat they had with the Tutor. The Grading Assistant looks at the focus and the pre-writing that led to it. This is about critical thinking, not grammar or polish.',
    ]);
    // "Watch the short tutorial video" opens Lesson 2's tutorial.
    expect(section('prewriting', 'how-it-works').blocks[1]).toEqual({
      type: 'paragraph',
      text: '**First time teaching it?** Watch the short tutorial video before class. It walks you through this step of the Yawp! writing process and comes with a ready-to-teach lesson (slides and handouts) you can use as is or edit.',
      tutorial: { lesson: 'pre-writing', linkText: 'Watch the short tutorial video' },
    });
    const philosophy = section('prewriting', 'philosophy');
    expect(philosophy.heading).toBe('Yawp! philosophy on essay prompts');
    expect(paragraphs(philosophy.blocks)).toEqual([
      "We've found that students write their best essays about something they actually care about, so many of our prompts are open on purpose and let students choose their own adventure within a topic. That's exactly what pre-writing is for. Still, some students and teachers prefer a tighter, more specific scope, and that's OK too! Either way, help students find their personal connection to the topic. If a student is stuck, send them to the emotional charge: what they loved, what grabbed them, what made them upset.",
    ]);
    // "Have your own prompt? Click New above…" is gone: How it works says it.
    // The library itself follows the boxes, with nothing loose above it.
    expect(page('prewriting').sections.map((s) => s.id)).toEqual([
      'how-to-teach-it',
      'when-to-use-it',
      'how-it-works',
      'philosophy',
    ]);
    const text = landingPagePlainText(page('prewriting'));
    expect(text).not.toContain('Have your own prompt');
    expect(text).not.toContain('Note:');
    expect(text).not.toContain('—');
    expect(page('prewriting').libraryNote).toBeNull();
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
    expect(section('thesis-statement', 'how-it-works').blocks[1]).toMatchObject({
      tutorial: { lesson: 'thesis-statement', linkText: 'Watch the short tutorial video' },
    });
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
    const text = landingPagePlainText(page(key)) + (page(key).libraryNote ?? '');
    expect(text).toContain(key === 'ap-history' ? 'Create assignment' : 'New');
  });

  test('only multi-step essays list their steps; one-step types have no Modules block', () => {
    const blockTypes = (key: LandingPageKey) =>
      page(key).sections.flatMap((s) => s.blocks.map((b) => b.type));
    const withSteps = keys.filter((key) => blockTypes(key).includes('steps'));
    expect(withSteps.sort()).toEqual(
      (['act-writing', 'cer-paragraph', 'five-paragraph-essay'] as LandingPageKey[]).sort()
    );
    // Only the Thesis-Driven Essay has the course, with lesson plans and decks.
    expect(keys.filter((key) => blockTypes(key).includes('course'))).toEqual([
      'thesis-driven-essay',
    ]);
    // The two steps with a lesson of their own show that one lesson.
    expect(keys.filter((key) => blockTypes(key).includes('lesson')).sort()).toEqual([
      'prewriting',
      'thesis-statement',
    ]);
  });

  describe('How to Teach It on the step pages (Kevin, Nov 5; not Brian’s copy)', () => {
    test.each([
      ['prewriting', 'pre-writing', 'Pre-writing is the first step of any major essay assignment'],
      ['thesis-statement', 'thesis-statement', 'Developing a thesis statement is Lesson 3 of the Thesis-Driven Essay course'],
    ] as const)('%s opens with How to Teach It and its lesson', (key, slug, lead) => {
      const sections = page(key).sections;
      expect(sections[0]!.id).toBe('how-to-teach-it');
      expect(sections[0]!.heading).toBe('How to Teach It');
      const [intro, lesson] = sections[0]!.blocks;
      expect(intro!.type).toBe('paragraph');
      expect(paragraphs([intro!])[0]).toContain(lead);
      expect(paragraphs([intro!])[0]).toContain('watch the short tutorial video before you teach it');
      expect(lesson).toEqual({ type: 'lesson', slug });
      // Brian's sections follow, in his order.
      expect(sections.slice(1).map((s) => s.id)).toEqual(
        key === 'prewriting'
          ? ['when-to-use-it', 'how-it-works', 'philosophy']
          : ['when-to-use-it', 'how-it-works', 'what-makes-a-strong-thesis']
      );
      expect(landingPagePlainText(page(key))).toContain(lead);
    });
  });

  test('a page with a library introduces it in a Prompt Library section or at the top of the library', () => {
    for (const key of keys) {
      const hasSection = page(key).sections.some((s) => s.id === 'prompt-library');
      const introduced = hasSection || page(key).libraryNote !== null;
      // Pre-Writing's How it works already says where its prompts come from.
      expect({ key, introduced }).toEqual({
        key,
        introduced: page(key).library !== null && key !== 'prewriting',
      });
    }
  });

  test('the step pages and Class Starter have no loose paragraphs between their boxes', () => {
    for (const key of ['class-starter', 'prewriting', 'thesis-statement', 'thesis-driven-essay'] as const) {
      expect({ key, ids: page(key).sections.map((s) => s.id) }).toEqual({
        key,
        ids: page(key).sections.map((s) => s.id).filter((id) => id !== 'prompt-library'),
      });
    }
  });

  test('only the step pages link a paragraph to a lesson tutorial', () => {
    const linked = keys.filter((key) =>
      page(key).sections.some((s) =>
        s.blocks.some((b) => b.type === 'paragraph' && b.tutorial)
      )
    );
    expect(linked.sort()).toEqual(['prewriting', 'thesis-statement']);
    for (const key of linked) {
      for (const s of page(key).sections) {
        for (const b of s.blocks) {
          if (b.type === 'paragraph' && b.tutorial) expect(b.text).toContain(b.tutorial.linkText);
        }
      }
    }
  });
});

// Brian, Nov 15: Daily Pages is now Short Response. Class Starter and Exit
// Ticket took over the daily writing, so the old name confuses teachers.
describe('Short Response (previously Daily Pages)', () => {
  const shortResponse = LANDING_PAGES['daily-pages'];

  test('the description is Brian’s, word for word', () => {
    expect(paragraphs(shortResponse.description)).toEqual([
      'Students write one or two paragraphs that argue, explain, analyze, or reflect on a specific passage, question, or topic. More than a Class Starter, less than an essay.',
    ]);
  });

  test('the page never says Daily Pages', () => {
    expect(landingPagePlainText(shortResponse)).not.toMatch(/daily pages/i);
    expect(shortResponse.libraryNote ?? '').not.toMatch(/daily pages/i);
  });

  test('the heading reads Short Response while the type is still titled Daily Pages', () => {
    expect(landingPageHeading('daily-pages', 'Daily Pages')).toBe('Short Response');
    expect(landingPageHeading('daily-pages', ' daily pages ')).toBe('Short Response');
    expect(landingPageHeading('daily-pages', 'Short Response')).toBe('Short Response');
  });

  test('a title a school chose, and every other page, is left alone', () => {
    expect(landingPageHeading('daily-pages', 'Friday Journal')).toBe('Friday Journal');
    expect(landingPageHeading('class-starter', 'Class Starter')).toBe('Class Starter');
    expect(landingPageHeading('cer-paragraph', 'Science CER')).toBe('Science CER');
    expect(landingPageHeading(null, 'Daily Pages')).toBe('Daily Pages');
  });
});

describe('landingPageFor (Brian, Nov 17)', () => {
  const NO_TUTOR =
    'Exit tickets have no tutor. Students offer a quick reflection, a question, or their understanding of a concept. This is something they can do on their own without tutor support.';

  test('with the revised builder, the Exit Ticket page says there is no tutor', () => {
    const how = landingPageFor('exit-ticket', { exitTicketNoTutor: true })
      .sections.find((s) => s.id === 'how-it-works')!;
    const text = paragraphs(how.blocks);
    expect(text).toContain(NO_TUTOR);
    expect(text.some((t) => t.includes('Tutor off or on?'))).toBe(false);
    // In the same place: after the two types, before grading.
    expect(text.indexOf(NO_TUTOR)).toBe(
      text.findIndex((t) => t.startsWith('**Grading is optional.**')) - 1
    );
  });

  test('without it, the page is unchanged', () => {
    expect(landingPageFor('exit-ticket', { exitTicketNoTutor: false })).toBe(
      LANDING_PAGES['exit-ticket']
    );
  });

  test('every other page is unchanged either way', () => {
    expect(landingPageFor('daily-pages', { exitTicketNoTutor: true })).toBe(
      LANDING_PAGES['daily-pages']
    );
  });
});

describe('5-Paragraph Essay How to Teach It (Brian, Nov 17)', () => {
  const howToTeach = () => section('five-paragraph-essay', 'how-to-teach-it');

  test('keeps the heading and opens with his note, then How long, word for word', () => {
    expect(howToTeach().heading).toBe('How to Teach It');
    expect(paragraphs(howToTeach().blocks)).toEqual([
      'Most English teachers already have a way of teaching the five-paragraph essay, and Yawp! is built to work alongside yours. As you teach the process, students work through the steps below in their documents, and the Yawp! Tutor coaches them through each one: pre-writing, a three-point thesis, an introduction, three body paragraphs, a conclusion, a title, and a final review.',
      '**How long.** Plan on 5 to 7 class periods if students are writing in class (which we support and recommend!). Most students finish one or two modules a day.',
    ]);
  });

  test('the student grading rubric downloads as an editable Word file right above the modules (Brian, Nov 25)', () => {
    const blocks = howToTeach().blocks;
    const index = blocks.findIndex((b) => b.type === 'download');
    expect(blocks[index + 1]!.type).toBe('steps');
    const rubric = blocks[index]!;
    if (rubric.type !== 'download') throw new Error('no rubric');
    expect(rubric).toEqual({
      type: 'download',
      label: 'Grading rubric',
      href: '/courses/five-paragraph-essay/five-paragraph-essay-student-rubric.docx',
      fileName: 'Yawp! 5-Paragraph Essay Student Rubric.docx',
    });
    const file = readFileSync(join(import.meta.dir, '../../../../public', rubric.href));
    // A .docx is a zip.
    expect(file.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  test('does not mention the Lesson Planner', () => {
    const text = landingPagePlainText(page('five-paragraph-essay'));
    expect(text).not.toMatch(/Lesson Planner/i);
    expect(
      howToTeach().blocks.some((b) => b.type === 'paragraph' && b.plannerLink)
    ).toBe(false);
  });

  test('the note and How long lead into the rubric and the steps; the old intro lines are gone', () => {
    const blocks = howToTeach().blocks;
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'download', 'steps']);
    const steps = blocks[3]!;
    expect(steps.type === 'steps' && steps.lead).toBeFalsy();
    const text = landingPagePlainText(page('five-paragraph-essay'));
    expect(text).not.toContain('Teach the steps below in order.');
    expect(text).not.toContain('Teach these steps in order.');
  });

  const steps = () => {
    const block = howToTeach().blocks.find((b) => b.type === 'steps');
    if (!block || block.type !== 'steps') throw new Error('no steps');
    return block;
  };
  const describe5 = (title: string) => stepDescription(steps(), title);

  test.each([
    ['Pre-Writing', 'Students write freely on your prompt for at least five minutes.'],
    ['Pre-writing', 'Students write freely on your prompt for at least five minutes.'],
    ['Thesis Statement', 'Students turn their position and three points into one thesis sentence.'],
    ['Writing your Thesis Statement', 'Students turn their position and three points into one thesis sentence.'],
    ['Introduction', 'Students write an introduction with three parts'],
    ['Introduction Paragraph', 'Students write an introduction with three parts'],
    ['Body Paragraph 1', 'Students write the paragraph for their first point'],
    ['Body Paragraph One', 'Students write the paragraph for their first point'],
    ['Body Paragraph 2', 'Students write the paragraph for their second point'],
    ['Body Paragraph #3', 'Students write the paragraph for their third point'],
    ['Conclusion', 'Students write a conclusion in three parts'],
    ['Conclusion Paragraph', 'Students write a conclusion in three parts'],
    ['Title', 'Students title their essay'],
    ['Title your Essay', 'Students title their essay'],
    ['Review My Essay', 'Students clean up their document and check the essay in two passes.'],
    ['Review My Essay! ', 'Students clean up their document and check the essay in two passes.'],
  ])('%s gets its description', (title, start) => {
    expect(describe5(title)).toStartWith(start);
  });

  test('a module it has no description for gets none', () => {
    expect(describe5('Welcome to Yawp! ')).toBeNull();
    // One combined body module is not any single body paragraph.
    expect(describe5('Body Paragraphs')).toBeNull();
    expect(describe5('Peer Review')).toBeNull();
  });

  test('the longer descriptions are his, word for word', () => {
    expect(describe5('Body Paragraph 1')).toBe(
      'Students write the paragraph for their first point while the Tutor coaches them through the traditional structure: topic sentence, concrete detail, two sentences of commentary, and a concluding sentence (more is welcome). It accepts common names for each part (general sentence, evidence, analysis, closing sentence) and pushes hardest on commentary, the part students skip most.'
    );
    expect(describe5('Review My Essay')).toBe(
      'Students clean up their document and check the essay in two passes. First, the Tutor reviews it against the rubric (Thesis and Focus, Support and Explanation, and Organization), naming what\'s working and giving one fix at a time. Then it covers spelling and grammar, helping students find and fix errors without correcting them itself. It never gives or predicts a score.'
    );
  });

  test('ACT Writing steps carry no descriptions', () => {
    const act = section('act-writing', 'how-to-teach-it').blocks.find((b) => b.type === 'steps');
    if (!act || act.type !== 'steps') throw new Error('no steps');
    expect(stepDescription(act, 'Introduction')).toBeNull();
  });
});

describe('The CER Paragraph (Brian, Nov 24)', () => {
  const howToTeach = () => section('cer-paragraph', 'how-to-teach-it');
  const howItWorks = () => section('cer-paragraph', 'how-it-works');

  test('the heading reads The CER Paragraph while the type is still titled C-E-R', () => {
    expect(landingPageHeading('cer-paragraph', 'C-E-R')).toBe('The CER Paragraph');
    expect(landingPageHeading('cer-paragraph', ' c-e-r ')).toBe('The CER Paragraph');
    expect(landingPageHeading('cer-paragraph', 'The CER Paragraph')).toBe(
      'The CER Paragraph'
    );
  });

  test('the description is his, word for word', () => {
    expect(paragraphs(page('cer-paragraph').description)).toEqual([
      "The CER paragraph teaches students to argue from evidence in one focused paragraph. Your school may call it something else: CEA (Claim, Evidence, Analysis), ACE (Answer, Cite, Explain), RACE/RACES (Restate, Answer, Cite, Explain, Summarize), or PEEL (Point, Evidence, Explain, Link). Whether you're ACEing, RACEing, or PEELing, the idea is the same: students take a position, support it with evidence, and explain how that evidence proves their point. Every analytical essay is built from paragraphs like this one, and it works in any subject: a short response in English, a lab conclusion in science, or a document question in history.",
    ]);
  });

  test('How to Teach It is his note, then the four modules, and never mentions the Lesson Planner', () => {
    expect(howToTeach().heading).toBe('How to Teach It');
    expect(paragraphs(howToTeach().blocks)).toEqual([
      'Whatever your school calls this paragraph, Yawp! is built to work alongside the way you already teach it. Students write the paragraph one part at a time in their documents, and the Yawp! Tutor coaches them through each part: the claim, the evidence, the reasoning, and a final wrap-up. If your version asks for more than one piece of evidence, students repeat the evidence and reasoning steps before they finish.',
    ]);
    expect(howToTeach().blocks.map((b) => b.type)).toEqual(['paragraph', 'steps']);
    expect(landingPagePlainText(page('cer-paragraph'))).not.toMatch(/Lesson Planner/i);
  });

  const steps = () => {
    const block = howToTeach().blocks.find((b) => b.type === 'steps');
    if (!block || block.type !== 'steps') throw new Error('no steps');
    return block;
  };
  const describeCer = (title: string) => stepDescription(steps(), title);

  test.each([
    [
      'Claim',
      'Students break down the question and write a claim: one sentence that answers the question and takes a position. The Tutor helps them see what the question is really asking. Then it checks that the claim answers the question, takes a position, and can be proven.',
    ],
    [
      'Evidence',
      'Students find the one piece of evidence that best proves their claim. When the question is about a text, the Tutor helps them pick the strongest line, trim it, put the exact words in quotation marks, and set it up for the reader. When the question is open, the Tutor pushes for a specific fact, number, example, or observation someone could check.',
    ],
    [
      'Reasoning',
      "This is the heart of the paragraph, and it's often the hardest part for students. As students explain how their evidence proves their claim, the Tutor teaches them specific moves for getting it right. If your question asks for two pieces of evidence, students do evidence and reasoning a second time in this step.",
    ],
    [
      'Wrap It Up / Clean It Up',
      'Wrap It Up: students add a closing sentence, and the Tutor checks that every part of the paragraph is there. Clean It Up: the Tutor points out grammar and spelling errors and teaches students how to fix them. It never makes the corrections for them.',
    ],
    [
      'Wrap It Up & Clean It Up',
      'Wrap It Up: students add a closing sentence, and the Tutor checks that every part of the paragraph is there. Clean It Up: the Tutor points out grammar and spelling errors and teaches students how to fix them. It never makes the corrections for them.',
    ],
  ] as const)('%s gets its description, word for word', (title, text) => {
    expect(describeCer(title)).toBe(text);
  });

  test('a module it has no description for gets none', () => {
    expect(describeCer('C-E-R')).toBeNull();
    expect(describeCer('Claim-Evidence-Reasoning')).toBeNull();
    expect(describeCer('Introduction')).toBeNull();
  });

  test('How it works uses the same bold lead-ins as the 5-Paragraph Essay, word for word', () => {
    expect(howItWorks().heading).toBe('How it works');
    expect(paragraphs(howItWorks().blocks)).toEqual([
      'Click **New** above and write your question or prompt. It can be about a text, a lab, a primary source, or any question that needs an argument.',
      "**Tutor on or off?** With the Tutor on, students get feedback at every step: questions that push their thinking and help them see what's missing. It will never write for them. Turn it off if you want to see how students do on their own.",
      '**Grading follows the rubric.** When students submit, the Grading Assistant scores the paragraph and drafts feedback. You review it, change anything you like, and release the grade.',
    ]);
    expect(page('cer-paragraph').sections.map((s) => s.id)).toEqual([
      'how-to-teach-it',
      'how-it-works',
    ]);
    expect(page('cer-paragraph').library).toBeNull();
  });
});

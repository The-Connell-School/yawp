import { describe, expect, test } from 'bun:test';
import { rubricCategories } from '~/domain/grading/rubric';
import { SLIDE_LAYOUTS } from '~/domain/lesson-planner/slide-deck';
import { MATERIAL_KINDS } from '~/domain/lesson-planner/lesson-material';
import { UNIT_PLAN_FENCE } from '~/domain/lesson-planner/unit-plan';
import {
  buildLessonPlannerSystemPrompt,
  RECOMMENDED_LESSON_PLANNER_PROMPTS,
} from './build-system-prompt';

describe('buildLessonPlannerSystemPrompt', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: 'Ms. Rivera',
    organizationName: 'Connell School',
  });

  test('includes the teacher and organization context', () => {
    expect(prompt).toContain('Ms. Rivera');
    expect(prompt).toContain('Connell School');
  });

  test('names the expertise the planner is supposed to bring', () => {
    const lower = prompt.toLowerCase();
    for (const expertise of [
      'pedagogy',
      'differentiation',
      'psychology',
      'group work',
      'audience',
    ]) {
      expect(lower).toContain(expertise);
    }
  });

  test('grounds the model in the canonical grading rubric, verbatim', () => {
    for (const category of rubricCategories) {
      expect(prompt).toContain(category.label);
      expect(prompt).toContain(category.description);
    }
  });

  test('lists the artifacts a teacher can ask for', () => {
    const lower = prompt.toLowerCase();
    for (const artifact of [
      'slide deck',
      'lecture notes',
      'activit',
      'handout',
      'exit ticket',
    ]) {
      expect(lower).toContain(artifact);
    }
  });

  test('requires parallel lessons when the teacher describes two class personalities', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('introvert');
    expect(lower).toContain('extrovert');
    // The differentiated versions must stay genuinely different, not relabeled.
    expect(lower).toContain('same objective');
  });

  test('asks for the class context it needs before planning blind', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('grade level');
    expect(lower).toContain('how long');
  });

  test('forbids inventing Yawp curriculum or class data', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('do not invent');
    expect(lower).toContain('never fabricate');
  });

  test('keeps the clickable suggestions protocol the chat UI parses', () => {
    expect(prompt).toContain('```suggestions');
  });

  test('requires suggestion chips on the turn that asks for class context', () => {
    const lower = prompt.toLowerCase();
    // The intake turn is where one-tap answers save the most typing, and the
    // planner opens with it almost every time.
    expect(lower).toContain('always end with one when you ask for class');
  });

  test('asks for whole ready-to-send answers, not fragments', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('send verbatim');
    expect(lower).toContain('a whole reply the teacher could have typed');
  });

  test('does not tell the planner to omit chips whenever it is not offering a menu', () => {
    // The old rule suppressed chips on open questions — which is exactly the
    // intake turn, where they are most useful.
    expect(prompt.toLowerCase()).not.toContain(
      'omit the block entirely when you are not asking the teacher to choose'
    );
  });

  test('drops the teacher name gracefully when it is unknown', () => {
    const anonymous = buildLessonPlannerSystemPrompt({
      teacherName: null,
      organizationName: 'Connell School',
    });
    expect(anonymous).toContain('a teacher');
    expect(anonymous).not.toContain('null');
  });
});

describe('RECOMMENDED_LESSON_PLANNER_PROMPTS', () => {
  test('exposes a stable set of starter prompts', () => {
    expect(RECOMMENDED_LESSON_PLANNER_PROMPTS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const entry of RECOMMENDED_LESSON_PLANNER_PROMPTS) {
      expect(entry.id).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.prompt).toBeTruthy();
      ids.add(entry.id);
    }
    expect(ids.size).toBe(RECOMMENDED_LESSON_PLANNER_PROMPTS.length);
  });

  test('offers the single artifacts a teacher asks for on their own', () => {
    // Not every visit is a whole period; sometimes it is just the handout.
    const ids = RECOMMENDED_LESSON_PLANNER_PROMPTS.map((entry) => entry.id);
    expect(ids).toContain('handout');
    expect(ids).toContain('exit-ticket');
    expect(ids).toContain('extra-practice');
  });
});

describe('buildLessonPlannerSystemPrompt — teaching out of Yawp', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('tells the planner to build lessons out of Yawp itself', () => {
    const lower = prompt.toLowerCase();
    for (const surface of [
      'daily pages',
      'quick writing lesson',
      "teacher's lounge",
      'assignment',
    ]) {
      expect(lower).toContain(surface);
    }
  });

  test('names the catalog tools it should call before improvising', () => {
    for (const tool of [
      'search_daily_pages_prompts',
      'list_writing_lessons',
      'get_writing_lesson',
      'list_lounge_materials',
      'list_assignment_types',
    ]) {
      expect(prompt).toContain(tool);
    }
  });

  test('stops making every opening option about the room’s personality', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain("do not make every option about the room's");
    expect(lower).toContain('vary what the options are for');
  });

  test('does not treat the room’s temperament as missing information', () => {
    const lower = prompt.toLowerCase();
    // It was asking every teacher how chatty the class is, then offering
    // "talkative" and "quiet" versions of the same choice.
    expect(lower).toContain(
      'do not ask how talkative, quiet, shy, or outgoing the class is'
    );
    expect(lower).toContain(
      'silence on the subject is not missing information'
    );
    expect(lower).toContain(
      'personality is one of those axes, not the default'
    );
  });

  test('does not model a room-personality option in its own example', () => {
    // The model copies the shape of the example, so the example must not be
    // the thing being discouraged.
    expect(prompt).not.toContain('They talk freely');
  });

  test('tells the model the standard option is pinned by the app', () => {
    expect(prompt).toContain(
      'Look at my classes and tell me what they need work on'
    );
    expect(prompt.toLowerCase()).toContain('do not write your own version');
  });

  test('requires real ids and links for anything it cites from the catalog', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('prompt id');
    expect(lower).toContain('link');
  });

  test('forbids naming Yawp material that did not come back from a tool', () => {
    const lower = prompt.toLowerCase();
    // The old blanket ban on naming Yawp material is gone — it must now cite
    // real catalog items and only those.
    expect(lower).toContain('never name a daily pages prompt');
    expect(lower).toContain('did not come back from a tool');
  });

  test('prefers existing Yawp material over inventing an activity', () => {
    expect(prompt.toLowerCase()).toContain('before you invent');
  });

  test('forbids assembling a link the tools never returned', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('came back from a tool in this conversation');
    // The app strips them; the model should know that rather than be surprised.
    expect(lower).toContain('strips any link it cannot match');
  });
});

describe('buildLessonPlannerSystemPrompt — a warm-up it wrote', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('names the fence the chat parses', () => {
    expect(prompt).toContain('```yawp-daily-pages');
  });

  test('says the block is what makes the prompt assignable', () => {
    expect(prompt.toLowerCase()).toContain('daily pages assignment');
  });

  test('requires the block for a library prompt too, not only a written one', () => {
    const lower = prompt.toLowerCase();
    // A step reading "Warm-up — Daily Pages (7 min)" with no text left the
    // teacher taking it on faith that a suitable prompt existed.
    expect(lower).toContain('every daily pages warm-up');
    expect(lower).toContain(
      'never name, cite, or allude to a prompt whose words you have not shown'
    );
  });

  test('shows how a library prompt carries its id', () => {
    expect(prompt).toContain('id: FW-001');
    expect(prompt.toLowerCase()).toContain('never invent one');
  });

  test('bans the "not from the library" disclaimer the teacher never wanted', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('not from the library');
    expect(lower).toContain('never write');
    // And the instruction that used to produce it is gone.
    expect(lower).not.toContain('say so in one clause');
  });

  test('keeps the prompt out of the plan as well as in the block', () => {
    expect(prompt.toLowerCase()).toContain('do not also quote the prompt');
  });
});

describe('buildLessonPlannerSystemPrompt — slide decks', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('asks for a structured deck, not a description of one', () => {
    expect(prompt).toContain('```yawp-slides');
    expect(prompt.toLowerCase()).toContain('json');
  });

  test('documents every layout the renderer can draw', () => {
    for (const layout of SLIDE_LAYOUTS) {
      expect(prompt).toContain(layout);
    }
  });

  test('spells out the fields each layout takes', () => {
    // The failure that shipped: the model guessed "prompt" for a prompt slide
    // because only three layouts were shown in the example.
    expect(prompt).toContain('NOT a field called "prompt"');
    expect(prompt).toContain('`left` and `right`');
    expect(prompt).toContain('Needs `bullets`');
    expect(prompt).toContain('optional `attribution`');
  });

  test('tells it not to number steps by hand', () => {
    expect(prompt.toLowerCase()).toContain('do not write "1."');
  });

  test('names the exact fence tag', () => {
    expect(prompt).toContain('tagged exactly `yawp-slides`');
  });

  test('requires speaker notes on every slide', () => {
    expect(prompt.toLowerCase()).toContain('every slide needs speakernotes');
  });

  test('keeps the talking off the wall and in the notes', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('the notes carry the talking');
    expect(lower).toContain('one idea per slide');
  });

  test('warns that an oversized slide is rejected outright', () => {
    expect(prompt.toLowerCase()).toContain('will not render');
  });

  test('tells it to use compare for two versions side by side', () => {
    expect(prompt.toLowerCase()).toContain('two versions of the same sentence');
  });

  test('gives the limits as numbers, not as "about"', () => {
    // "Keep bullets under about fifteen words" is not a rule the model can
    // check itself against; the validator counts characters.
    expect(prompt).toContain('200 characters');
    expect(prompt).toContain('320 characters');
    expect(prompt).toContain('90 characters');
    expect(prompt).toContain('7 bullets');
  });

  test('warns off the two things that break a hand-written deck', () => {
    const lower = prompt.toLowerCase();
    // An unescaped quote in a speaker note, and a time box written as a range.
    expect(lower).toContain('never type a double quote inside a json string');
    expect(lower).toContain('must be a plain number');
  });

  /**
   * The bug: a lesson plan that told the teacher to "project the first slide of
   * the deck below" when no deck was in the reply and none was in the packet.
   * The plan and the deck are separate turns by design — the app pins "Build
   * the slide deck for this lesson" — so the plan must never point forward at
   * one.
   */
  test('forbids pointing at a deck it has not built', () => {
    const lower = prompt.toLowerCase();

    expect(lower).toContain('never point at a deck you have not built');
    // The exact phrasings it reached for.
    expect(lower).toContain('the deck below');
    expect(lower).toContain('stands on its own');
  });

  test('says a deck that does exist is named, not placed', () => {
    // "Below" is a lie once the deck is a card of its own or a page in the
    // packet, which is everywhere the teacher actually meets it.
    expect(prompt.toLowerCase()).toContain('name it, never place it');
  });

  test('forbids claiming a deck rendered, because it cannot see the screen', () => {
    const lower = prompt.toLowerCase();
    // What actually happened: the deck failed validation, and the planner told
    // the teacher to scroll down and look for it.
    expect(lower).toContain('you cannot see the teacher');
    expect(lower).toContain('never tell them to scroll');
    expect(lower).toContain('build the deck again');
  });
});

describe('buildLessonPlannerSystemPrompt — handing over real material', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('asks for material as its own block, not as text to copy out', () => {
    expect(prompt).toContain('```yawp-material');
    for (const kind of MATERIAL_KINDS) {
      expect(prompt).toContain(kind);
    }
  });

  test('says the material is Markdown, not JSON', () => {
    // Escaping a whole handout into a JSON string is the shape that cost
    // teachers their slide decks.
    expect(prompt).toContain('ordinary Markdown (NOT JSON');
  });

  test('forbids telling a teacher to supply an example it did not write', () => {
    const lower = prompt.toLowerCase();
    // "Model with two versions of the same paragraph" — written by whom?
    expect(lower).toContain(
      'never tell a teacher to supply an example you did not write'
    );
    expect(lower).toContain('is homework you handed the teacher');
  });

  test('stops burying handouts in a collapsible', () => {
    expect(prompt).not.toContain('<details><summary>');
    expect(prompt.toLowerCase()).toContain('not in a collapsible');
  });

  test('will not invent a warm-up before it has really searched', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain(
      'never write your own warm-up prompt without searching'
    );
    expect(lower).toContain('never search once and give up');
  });
  test('scopes "below" to the reply that carries the block', () => {
    // The house style for pointing at material is "the two drafts below",
    // which the planner generalised into pointing at things that were not
    // there at all.
    expect(prompt.toLowerCase()).toContain('only true for a block in this reply');
  });

});

describe('buildLessonPlannerSystemPrompt — what the lesson already has', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
    lessonInventory: [
      { slot: 'deck', kind: 'slides', title: 'Evidence that earns its place' },
      {
        slot: 'handout:diagnose-repair',
        kind: 'handout',
        title: 'Diagnose & Repair',
      },
    ],
  });

  test('lists what the teacher has already filed, with its slot', () => {
    expect(prompt).toContain('Evidence that earns its place');
    expect(prompt).toContain('handout:diagnose-repair');
    expect(prompt).toContain('Diagnose & Repair');
  });

  test('tells it to revise what exists instead of building a second one', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('do not build a second');
    expect(lower).toContain('reuse its slot');
  });

  test('makes it say what a change leaves out of date', () => {
    const lower = prompt.toLowerCase();
    // Changing the plan quietly invalidates the deck built from it.
    expect(lower).toContain('now out of date');
    expect(lower).toContain('offer to update');
  });

  test('says nothing at all when the lesson is empty', () => {
    const empty = buildLessonPlannerSystemPrompt({
      teacherName: null,
      organizationName: 'Connell School',
    });
    expect(empty).not.toContain('What this lesson already contains');
  });
});

describe('buildLessonPlannerSystemPrompt — asking with controls', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('names the block the chat renders into controls', () => {
    expect(prompt).toContain('```yawp-ask');
    expect(prompt).toContain('minutes: 50');
    expect(prompt).toContain('activities');
  });

  test('asks for the length with the slider rather than in words', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('5 to 90 minutes');
    expect(lower).toContain('never ask for the length in words');
  });

  test('says when the activity list is worth asking for and when it is not', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('could genuinely be built more than one way');
    expect(lower).toContain('do not ask for it when');
  });

  test('keeps the machinery off the teacher’s screen', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('do not list the activities yourself');
    expect(lower).toContain('never mention the block');
  });
});

describe('buildLessonPlannerSystemPrompt — the plan comes first', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('forbids a preamble in front of the lesson', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('open with the lesson');
    expect(lower).toContain('first line is the lesson');
  });

  test('forbids narrating its own process', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('never narrate your own process');
    expect(lower).toContain('i searched for');
  });

  test('no longer asks it to explain why it built its own deck', () => {
    // That instruction was producing the preamble it is now told not to write.
    expect(prompt).not.toContain('and say that is why');
  });
});

describe('buildLessonPlannerSystemPrompt — bringing material in', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('names the fence the chat renders as an openable card', () => {
    expect(prompt).toContain('```yawp-resource');
    expect(prompt).toContain('href:');
    expect(prompt).toContain('kind: slides');
  });

  test('forbids sending the teacher off to find it themselves', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('never send a teacher looking');
    expect(lower).toContain('that is a set of directions');
  });

  test('warns that an invented address costs them the material', () => {
    expect(prompt.toLowerCase()).toContain(
      'yawp deletes any block whose address did not come back from a tool'
    );
  });
});

describe('buildLessonPlannerSystemPrompt — only claim what it has read', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('sends it to open the file before it describes one', () => {
    // list_lounge_materials returns a name, a type and an address — never the
    // contents. read_lounge_material is the difference between "slides 4–9
    // cover how to introduce a quote" being a fact and being invented.
    const lower = prompt.toLowerCase();
    expect(lower).toContain('open the file before you describe it');
    expect(lower).toContain('`read_lounge_material` gives you the contents');
  });

  test('expects it to use what it read, not hedge', () => {
    // Having opened the deck and then written "project the relevant part" is
    // the worst of both — the cost of reading with none of the benefit.
    const lower = prompt.toLowerCase();
    expect(lower).toContain('once you have read it, use what you read');
    expect(lower).toContain('quote a line off the slide');
  });

  test('keeps the old silence for anything it still cannot open', () => {
    // Keynote, PDFs, and image-only decks are still closed books.
    const lower = prompt.toLowerCase();
    expect(lower).toContain('anything you have not read stays closed');
    expect(lower).toContain('never cite a page or slide number');
  });

  test('keeps the rule off the sources it really can read', () => {
    expect(prompt).toContain(
      'Quick Writing Lessons and Daily Pages prompts come back as real text'
    );
  });
});

describe('buildLessonPlannerSystemPrompt — when to ask the length', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('names the one turn the slider belongs on', () => {
    expect(prompt.toLowerCase()).toContain(
      'exactly one turn for `minutes`: the intake batch'
    );
  });

  test('forbids it on the opening turn and under a finished plan', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('never ask for `minutes` on your opening turn');
    expect(lower).toContain(
      'never ask for `minutes` in a reply that contains a lesson plan'
    );
    // The app strips it either way; the model should know rather than be
    // surprised that its control vanished.
    expect(lower).toContain('yawp removes the control');
  });
});

describe('buildLessonPlannerSystemPrompt — a deck is not a playlist', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('requires a time budget on handed-over material', () => {
    // "Project the deck" plus a handout inside a 12-minute step is not a plan
    // anybody can follow.
    expect(prompt.toLowerCase()).toContain('it must contain a time budget');
    expect(prompt.toLowerCase()).toContain('make the arithmetic work');
  });

  test('says to name the part of a deck to use, not to play the whole thing', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('something to draw from, not something to play');
    // Now that it can open the deck, the numbers are the useful answer — but
    // only the ones it actually read.
    expect(lower).toContain(
      'slide numbers you got from `read_lounge_material`'
    );
    expect(lower).toContain(
      'if you have not opened the deck, you have no numbers'
    );
  });
});

describe('buildLessonPlannerSystemPrompt — the check covers the objective', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('requires the exit ticket to cover every part of the objective', () => {
    // A three-part objective checked by a one-part exit ticket leaves the
    // teacher finding out at essay-grading time.
    const lower = prompt.toLowerCase();
    expect(lower).toContain('check the whole objective');
    expect(lower).toContain('evidence of every one of them');
  });

  test('does not let self-report stand in for evidence', () => {
    expect(prompt.toLowerCase()).toContain(
      'asking students how confident they feel is not assessment'
    );
  });
});

describe('buildLessonPlannerSystemPrompt — a page a student can actually use', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });
  const lower = prompt.toLowerCase();

  test('addresses the student, not the teacher', () => {
    expect(lower).toContain('write it to the student, in second person');
    expect(lower).toContain(
      'nothing teacher-facing belongs on a page a fifteen-year-old is holding'
    );
  });

  test('refuses placeholders for material it did not write', () => {
    expect(lower).toContain(
      'everything the page refers to has to be on the page'
    );
    expect(lower).toContain('never write a placeholder');
  });

  test('leaves room to answer and does not duplicate the packet header', () => {
    expect(lower).toContain('leave real room to answer');
    // Yawp prints Name / Section / Date itself, so a second one the model
    // wrote would sit on the same sheet as the real one.
    expect(lower).toContain('do not write your own name line');
    expect(lower).toContain('"name / section / date"');
    expect(lower).toContain(
      'never ask a student to write their name, section, period, or the date'
    );
  });
});

describe('buildLessonPlannerSystemPrompt — exit tickets and extra practice', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });
  const lower = prompt.toLowerCase();

  test('sizes the exit ticket to the minutes it was given', () => {
    expect(lower).toContain('size it to the minutes it gets');
    expect(lower).toContain('by your slowest student');
  });

  test('sends the exit ticket out with what to look for', () => {
    // A teacher sorts tickets between classes or not at all.
    expect(lower).toContain('ship it with what to look for');
    expect(lower).toContain('what the common wrong answer looks like');
  });

  test('keeps practice on the skill the lesson taught, hardest last', () => {
    expect(lower).toContain(
      'practices the skill the lesson actually taught, not the general subject'
    );
    expect(lower).toContain('order the items easiest to hardest');
    expect(lower).toContain('one item that stretches past the lesson');
  });

  test('keeps the answer key off the student page', () => {
    expect(lower).toContain(
      'separate `answer-key` block, never printed on the student page'
    );
  });
});

describe('buildLessonPlannerSystemPrompt — a unit is not one long lesson', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });
  const lower = prompt.toLowerCase();

  test('offers a unit plan rather than a single period built out of Yawp', () => {
    const ids = RECOMMENDED_LESSON_PLANNER_PROMPTS.map((entry) => entry.id);
    expect(ids).toContain('unit-plan');
    expect(ids).not.toContain('build-from-yawp');
  });

  test('asks for the day-by-day map before any lesson is written', () => {
    // Ten full lessons in one reply is unreadable, unchangeable, and mostly
    // wrong the moment the teacher reacts to day one.
    expect(lower).toContain('give the map first and stop there');
    expect(lower).toContain('do not write ten full lessons in one reply');
  });

  test('requires each day to build on the last', () => {
    expect(lower).toContain('name what is new on each day');
    expect(lower).toContain('"continue practicing" is not a day');
  });

  test('counts the drafting and assessment days against the periods given', () => {
    expect(lower).toContain('if the teacher has 8 periods, the map has 8 days');
    expect(lower).toContain('an essay that appears from nowhere');
  });

  test('places the checks before the final piece', () => {
    expect(lower).toContain('which days carry a quick formative check');
    expect(lower).toContain('too late to teach');
  });
});

describe('buildLessonPlannerSystemPrompt — the unit map is a board', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('teaches the yawp-unit protocol the chat renders', () => {
    expect(prompt).toContain(UNIT_PLAN_FENCE);
    expect(prompt).toContain('```yawp-unit');
    // The fields the schema actually requires.
    for (const field of ['"day"', '"title"', '"objective"', '"students"']) {
      expect(prompt).toContain(field);
    }
  });

  test('says why the map is structured rather than written out', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('build this day');
    expect(lower).toContain('the way into the lessons');
  });

  test('forbids describing the days in prose as well', () => {
    // The board already lists them; saying it twice is what a teacher has to
    // read around.
    const lower = prompt.toLowerCase();
    expect(lower).toContain('never describe the days in prose as well');
    expect(lower).toContain('never mention json to the teacher');
  });

  test('keeps the cells to one line each', () => {
    expect(prompt.toLowerCase()).toContain('one short line per field');
  });
});

describe('buildLessonPlannerSystemPrompt — building one day of a unit', () => {
  test('says nothing about a unit when there is no context', () => {
    const prompt = buildLessonPlannerSystemPrompt({
      teacherName: null,
      organizationName: 'Connell School',
    });
    expect(prompt.toLowerCase()).not.toContain(
      'building one day out of a unit'
    );
  });

  test('hands over the day, its neighbours, and the unit it sits in', () => {
    const prompt = buildLessonPlannerSystemPrompt({
      teacherName: null,
      organizationName: 'Connell School',
      unitContext: {
        unitTitle: 'Writing the literary analysis paragraph',
        endsWith: 'One analysis paragraph on a passage they choose',
        totalDays: 3,
        day: {
          day: 2,
          title: 'Evidence that earns its place',
          objective: 'Choose the quote that proves the claim',
          students: 'Match claims to the strongest of three quotes',
          check: 'Two quote choices with a reason each',
          minutes: 50,
        },
        previous: {
          day: 1,
          title: 'What a claim is',
          objective: 'Tell a claim apart from a summary',
          students: 'Sort ten sentences',
          buildsTo: 'They need a claim before they can support one',
        },
        next: {
          day: 3,
          title: 'Putting it together',
          objective: 'Draft the full paragraph',
          students: 'Draft, then swap',
        },
      },
    });
    const lower = prompt.toLowerCase();

    expect(lower).toContain('day 2 of 3');
    expect(lower).toContain('choose the quote that proves the claim');
    // The day before's own ending, not its objective restated — buildsTo is
    // what it actually left students able to do.
    expect(lower).toContain('they need a claim before they can support one');
    expect(lower).toContain('do not re-teach that from the start');
    // The day after's assumption, so this day stops short of it.
    expect(lower).toContain('draft the full paragraph');
    expect(lower).toContain("is not this day's job");
    expect(lower).toContain('do not write another day-by-day map');
    expect(lower).toContain('do not emit a `yawp-unit` block');
  });

  test('says so when the day is the first, with nothing before it', () => {
    const prompt = buildLessonPlannerSystemPrompt({
      teacherName: null,
      organizationName: 'Connell School',
      unitContext: {
        unitTitle: 'A unit',
        endsWith: null,
        totalDays: 2,
        day: {
          day: 1,
          title: 'Day one',
          objective: 'Start',
          students: 'Begin',
        },
        previous: null,
        next: {
          day: 2,
          title: 'Day two',
          objective: 'Continue',
          students: 'Keep going',
        },
      },
    });
    expect(prompt.toLowerCase()).toContain('this is the first day of the unit');
  });

  test('says so when the day is the last, and names what the unit ends with', () => {
    const prompt = buildLessonPlannerSystemPrompt({
      teacherName: null,
      organizationName: 'Connell School',
      unitContext: {
        unitTitle: 'A unit',
        endsWith: 'A finished essay',
        totalDays: 2,
        day: {
          day: 2,
          title: 'Day two',
          objective: 'Finish',
          students: 'Wrap up',
        },
        previous: {
          day: 1,
          title: 'Day one',
          objective: 'Start',
          students: 'Begin',
        },
        next: null,
      },
    });
    const lower = prompt.toLowerCase();
    expect(lower).toContain('this is the last day of the unit');
    expect(lower).toContain('a finished essay');
  });
});

describe('buildLessonPlannerSystemPrompt — writing toward a self-chosen thesis', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });
  const lower = prompt.toLowerCase();

  test('names it as the default shape for an essay-ending unit, not a fixed-prompt assessment', () => {
    expect(lower).toContain('writing toward a self-chosen thesis');
    expect(lower).toContain(
      'the default shape for a unit that ends in an argument or analysis essay'
    );
    expect(lower).toContain(
      'not for a fixed-prompt assessment like a dbq or leq'
    );
  });

  test('teaches the recurring-open-daily-pages route by theme, not by plot', () => {
    expect(lower).toContain('recurring open daily pages across the unit');
    expect(lower).toContain("the unit's big themes, not its plot");
    expect(lower).toContain('how do people gain and lose power');
  });

  test('requires variety across the cluster rather than the same question five times', () => {
    expect(lower).toContain(
      'so several prompts spread across the unit ask genuinely different things'
    );
  });

  test('keeps the day cell to one line and defers the full prompt to when the day is built', () => {
    expect(lower).toContain('the day cell just names it');
    expect(lower).toContain('the full prompt with its id appears in its own');
  });

  test('tells the essay day to have students choose from their own writing, not a fresh topic', () => {
    expect(lower).toContain(
      'reread their own daily pages entries and choose the one that snagged them'
    );
    expect(lower).toContain('which entry are you building on and why');
    expect(lower).toContain('not a fresh topic assigned that morning');
  });

  test('teaches the open-single-prompt route with a real test for what makes it open', () => {
    expect(lower).toContain('an open prompt on the day itself');
    expect(lower).toContain('more than one defensible thesis fits under it');
    expect(lower).toContain(
      'not "the theme of power" floating free of the book'
    );
    expect(lower).toContain(
      'thirty different, defensible answers to actually grade'
    );
  });

  test('says the two routes can combine rather than forcing a choice', () => {
    expect(lower).toContain('a unit can do both');
  });

  test('cross-references the section from the unit anchor rule and the standalone essay-prompt bullet', () => {
    expect(lower).toContain(
      'when that final piece is an argument or analysis essay, see "writing toward a self-chosen thesis" below'
    );
    expect(lower).toContain(
      'an essay or thesis prompt, on its own or as the end of a lesson'
    );
  });
});

describe('buildLessonPlannerSystemPrompt — no bare prompt ids in a unit overview', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });
  const lower = prompt.toLowerCase();

  test('forbids a bare id list before any day is built', () => {
    // The exact failure: "Days 1-4 use FW-001, FW-014, FW-011, FW-172" tells a
    // teacher nothing about what their students will actually be asked.
    expect(lower).toContain('never drop bare ids like');
    expect(lower).toContain(
      'an id with no words behind it is not a preview, it is a code the teacher has to go look up'
    );
  });

  test('requires the cluster preview to bullet id and real text together', () => {
    expect(lower).toContain('bullet the cluster instead, one line per day');
    expect(lower).toContain("day 1 — fw-001: 'how do people gain power?'");
  });

  test('extends the general no-bare-citation rule to a multi-day overview', () => {
    expect(lower).toContain(
      'including in a unit overview that mentions several prompts across several days before any one of them is built'
    );
    expect(lower).toContain(
      'a recap that lists five ids with no text is the same failure'
    );
  });
});

describe('RECOMMENDED_LESSON_PLANNER_PROMPTS — the way in', () => {
  const byId = new Map(
    RECOMMENDED_LESSON_PLANNER_PROMPTS.map((prompt) => [prompt.id, prompt])
  );

  test('offers a plain "plan a lesson" for a teacher who has not narrowed it down', () => {
    expect(byId.get('plan-a-lesson')?.label).toBe('Plan a lesson');
  });

  test('keeps skill and standard as separate ways in', () => {
    // A teacher working from a standards document and a teacher working from
    // what their class is bad at are starting from different places.
    expect(byId.get('plan-a-skill')?.label).toBe('Plan a lesson on a skill');
    expect(byId.get('plan-a-standard')?.label).toBe(
      'Plan a lesson on a standard'
    );
  });

  test('asks the teacher to paste the standard rather than name a code', () => {
    // They already have the document open; a code would have to be resolved
    // against a catalog Yawp does not hold.
    expect(byId.get('plan-a-standard')?.prompt.toLowerCase()).toContain(
      'paste'
    );
  });

  test('every starter prompt is a whole message a teacher could send', () => {
    for (const prompt of RECOMMENDED_LESSON_PLANNER_PROMPTS) {
      expect(prompt.label.length).toBeGreaterThan(0);
      expect(prompt.prompt.length).toBeGreaterThan(20);
      expect(prompt.id).toMatch(/^[a-z0-9-]+$/);
    }
    const ids = RECOMMENDED_LESSON_PLANNER_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildLessonPlannerSystemPrompt — handing back several pieces at once', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('says what it built, at the top', () => {
    expect(prompt.toLowerCase()).toContain('say so at the top');
  });

  test('names each piece by the title on its card', () => {
    // "the handout" gives a teacher nothing to match against later.
    expect(prompt).toContain('Name each piece by its own title');
  });

  /**
   * The confusion from the demo: a plan that points somewhere instead of
   * saying what a thing is. It cannot see the screen, so a location is a guess
   * dressed as an instruction.
   */
  test('describes pieces rather than pointing at where they sit', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('do not tell the teacher where to look');
    expect(lower).toContain('on the right');
    expect(lower).toContain('in the sidebar');
  });

  test('talks about the stack, which is what the teacher sees', () => {
    expect(prompt).toContain('stack');
    expect(prompt).not.toContain('packet');
  });
});

import { describe, expect, test } from 'bun:test';
import { rubricCategories } from '~/domain/grading/rubric';
import { SLIDE_LAYOUTS } from '~/domain/lesson-planner/slide-deck';
import { MATERIAL_KINDS } from '~/domain/lesson-planner/lesson-material';
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

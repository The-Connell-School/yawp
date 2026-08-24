/**
 * A full-length graded essay for local development.
 *
 * The sparse one-sentence seeds are fine for asserting that a page renders,
 * but they tell you nothing about how the revision split screen actually
 * reads: whether comments collide, whether the feedback panel scrolls, whether
 * marks land where the student expects. This fixture is sized like real
 * student work — six paragraphs, nine teacher comments, eight assistant marks,
 * per-category rubric feedback and inline comments left on the draft itself.
 *
 * Every excerpt below must appear verbatim in `REVISION_ESSAY_TEXT`, at the
 * stated occurrence. `revision-fixture.test.ts` enforces that: an excerpt that
 * drifts out of the essay would otherwise vanish silently from the UI, since
 * both the grade-highlight overlay and the grammar parser drop anchors they
 * cannot resolve.
 */

export type FixtureTeacherComment = {
  content: string;
  excerpt: string;
  occurrence: number;
};

export type FixtureGrammarIssue = {
  id: string;
  excerpt: string;
  occurrence: number;
  kind: 'error' | 'style';
  rule: string;
  message: string;
};

export type FixtureDraftComment = {
  /** Stable within the fixture; the row id is built from it per seed. */
  key: string;
  content: string;
  /** Phrase in the essay the comment mark wraps. Must be unique. */
  anchor: string;
  /** Student replies, oldest first. */
  responses?: string[];
};

export type SeededDraftComment = FixtureDraftComment & { id: string };

export const REVISION_ESSAY_TITLE = 'What school owes a first-time voter';

export const REVISION_ESSAY_PARAGRAPHS = [
  'Every four years, adults line up to vote, but almost no one asks where they learned how. Schools teach students to solve for x and to name the branches of government, yet they rarely ask students to practice the harder work of disagreeing well. If schools want to prepare students for civic responsibility, they should stop treating citizenship as a unit in a textbook and start treating it as a skill that has to be rehearsed. Three changes would do the most good: teaching students to evaluate sources, giving them real decisions to make, and grading them on how they argue rather than on who they agree with.',
  'The first change is source evaluation. Most students I know get their news from whatever appears on their phone at seven in the morning. We are not taught to ask who paid for the story, or what got left out of it. In my own family, an article that was later corrected got shared to about forty people before anyone checked the date. A single class period spent tracing one claim back to its origin would teach more about citizenship than a whole chapter about the electoral college, because it builds a habit instead of a fact.',
  'The second change is giving students decisions that actually matter. Student government at my school votes on the theme for a dance. That is fine, but it is not practice for anything. Schools could hand a real budget line to students, even a small one, and let them argue over how to spend it. When the outcome is real, the arguing gets serious, and students learn that a decision costs somebody something. Being forced to choose between two good things is the part of citizenship nobody teaches.',
  'The third change is how we grade argument. In most classes, a persuasive essay is scored on whether it has five paragraphs and a hook. Very few teachers ask whether the writer represented the other side fairly. If we graded students on how accurately they could state the strongest version of an opposing view, we would be training the exact muscle that democracy runs on. It would also make the classroom feel less like a place where you guess what the teacher believes.',
  'Some people would say that schools should stay out of civics because it is too political and parents disagree about it. That worry is real, but it confuses teaching a method with teaching a conclusion. Nobody thinks a science teacher is being political for teaching students how to run a controlled experiment. Teaching a student to check a source, weigh a cost, and state an opponent’s view fairly is a method, not a party.',
  'Schools already claim that they are preparing students for the world. Civic responsibility is not a chapter that a student can memorize the night before; it is a set of habits that only form through repetition. If we spent as much time practicing disagreement as we spend practicing multiplication, my generation would walk into its first election knowing what to do there.',
];

export const REVISION_ESSAY_TEXT = REVISION_ESSAY_PARAGRAPHS.join('\n\n');

/**
 * Inline comments the teacher left on the draft while it was being written,
 * with the student's replies — the marks the revision screen deliberately does
 * not repeat on the working copy. DocumentComment has no author but a
 * membership, so the tutor's voice lives in REVISION_TUTOR_EXCHANGE instead,
 * which is the model the tutor actually writes to.
 *
 * DocumentComment.id is a global primary key and this seed runs once per
 * preview seat into one shared database, so ids are built per seed from a
 * caller-supplied prefix rather than hardcoded — see
 * buildRevisionDraftComments.
 */
export const REVISION_DRAFT_COMMENTS: FixtureDraftComment[] = [
  {
    key: 'thesis',
    anchor: 'they should stop treating citizenship as a unit in a textbook',
    content:
      'This is the sentence your whole essay rests on. Read it out loud — can you hear where the claim actually starts?',
    responses: [
      'I think it starts at "stop treating." I moved the three changes into their own sentence so this one can breathe.',
    ],
  },
  {
    key: 'evidence',
    anchor: 'In my own family',
    content:
      'You are about to use the strongest evidence you have. Slow down here and tell me what actually happened before you tell me what it proves.',
  },
  {
    key: 'budget',
    anchor: 'Schools could hand a real budget line to students',
    content:
      'Ambitious — I like it. Would any of the objections a principal might raise fit in this paragraph?',
    responses: [
      'Maybe? I ran out of room. I put the objection paragraph after the third change instead.',
      'That placement works. Leave it.',
    ],
  },
  {
    key: 'counter',
    anchor: 'That worry is real',
    content:
      'Good instinct conceding here. Do not concede so much that your own claim disappears.',
  },
];

/** Teacher comments on the released submission, in essay order. */
export const REVISION_TEACHER_COMMENTS: FixtureTeacherComment[] = [
  {
    excerpt:
      'Every four years, adults line up to vote, but almost no one asks where they learned how.',
    occurrence: 1,
    content:
      'Strong opening image — the voting line does real work here. Keep it exactly as it is.',
  },
  {
    excerpt:
      'they should stop treating citizenship as a unit in a textbook and start treating it as a skill that has to be rehearsed',
    occurrence: 1,
    content:
      'This is your thesis, and it is a good one. Say it earlier. A reader should not have to reach the third sentence to find out what you are arguing.',
  },
  {
    excerpt: 'Three changes would do the most good',
    occurrence: 1,
    content:
      'Naming the three changes up front is exactly right. Check that each body paragraph lands in this same order — right now the reader has to keep track for you.',
  },
  {
    excerpt: 'We are not taught to ask who paid for the story',
    occurrence: 1,
    content:
      'Who is "we" here? You have been writing about students in the third person, and this is the first place you step into the essay yourself. Pick one and hold it.',
  },
  {
    excerpt:
      'an article that was later corrected got shared to about forty people before anyone checked the date',
    occurrence: 1,
    content:
      'This is the most convincing evidence in the essay and the part you spend the least time on. Give it three more sentences: what was the article, who corrected it, and what happened after.',
  },
  {
    excerpt:
      'would teach more about citizenship than a whole chapter about the electoral college',
    occurrence: 1,
    content:
      'Careful — this is a claim, not a fact. Is there anything you can point to that supports it, or should it be softened to "might teach"?',
  },
  {
    excerpt: 'When the outcome is real, the arguing gets serious',
    occurrence: 1,
    content:
      'This sentence is the heart of the paragraph. Move it to the front and let the dance example follow it as proof.',
  },
  {
    excerpt:
      'That worry is real, but it confuses teaching a method with teaching a conclusion.',
    occurrence: 1,
    content:
      'This is a real counterargument, not a straw man, and answering it is the hardest thing this assignment asks for. You did it well.',
  },
  {
    excerpt:
      'my generation would walk into its first election knowing what to do there',
    occurrence: 1,
    content:
      'Nice ending. Same note as paragraph two: watch the shift into "my generation" when the rest of the essay keeps its distance.',
  },
];

/** Grading Assistant marks on the released submission. */
export const REVISION_GRAMMAR_ISSUES: FixtureGrammarIssue[] = [
  {
    id: 'localdev-grammar-person-shift',
    excerpt: 'We are not taught to ask who paid for the story',
    occurrence: 1,
    kind: 'style',
    rule: 'Consistent point of view',
    message:
      'The essay has been describing students in the third person, and this sentence switches to "we." Choose one point of view and keep it for the whole essay.',
  },
  {
    id: 'localdev-grammar-preposition',
    excerpt: 'got shared to about forty people',
    occurrence: 1,
    kind: 'error',
    rule: 'Preposition choice',
    message:
      'Something is shared *with* people, not *to* them. Consider: "was shared with about forty people."',
  },
  {
    id: 'localdev-grammar-passive-got',
    excerpt: 'an article that was later corrected got shared',
    occurrence: 1,
    kind: 'style',
    rule: 'Passive voice',
    message:
      'Two passive constructions stack up here, so the sentence never says who did anything. Who shared it?',
  },
  {
    id: 'localdev-grammar-vague-anything',
    excerpt: 'That is fine, but it is not practice for anything.',
    occurrence: 1,
    kind: 'style',
    rule: 'Vague reference',
    message:
      '"Anything" leaves the reader to guess. Practice for what — a budget vote, a jury, an election?',
  },
  {
    id: 'localdev-grammar-nominalization',
    excerpt: 'the arguing gets serious',
    occurrence: 1,
    kind: 'style',
    rule: 'Nominalization',
    message:
      '"The arguing" turns a verb into a thing and drains the energy out of it. Try "students argue seriously."',
  },
  {
    id: 'localdev-grammar-passive-scored',
    excerpt:
      'a persuasive essay is scored on whether it has five paragraphs and a hook',
    occurrence: 1,
    kind: 'style',
    rule: 'Passive voice',
    message:
      'Passive voice hides the actor. Teachers score the essay — say so, since your argument is about what teachers should do differently.',
  },
  {
    id: 'localdev-grammar-vague-attribution',
    excerpt: 'Some people would say',
    occurrence: 1,
    kind: 'style',
    rule: 'Vague attribution',
    message:
      '"Some people" is an anonymous opponent, which makes the counterargument easier to knock down than it should be. Name who actually says this.',
  },
  {
    id: 'localdev-grammar-wordiness',
    excerpt: 'Schools already claim that they are preparing students',
    occurrence: 1,
    kind: 'style',
    rule: 'Wordiness',
    message:
      'Five words do one word’s work. "Schools already claim to prepare students" says the same thing faster.',
  },
];

export const REVISION_RUBRIC_SCORES = {
  thesis_and_content: {
    score: 4,
    comment:
      'The thesis is arguable and specific — "a skill that has to be rehearsed" is a real position someone could disagree with, which is more than most essays in this batch manage. It arrives late, though. A reader who stops after two sentences has no idea what you are claiming.',
  },
  organization_and_structure: {
    score: 4,
    comment:
      'The three-part roadmap in the introduction is honored by the three body paragraphs, and putting the counterargument after them is the right call. Paragraph three buries its own topic sentence in the middle.',
  },
  evidence_and_support: {
    score: 3,
    comment:
      'The shared-article story is your best evidence and it gets one sentence. The claim about the electoral college chapter has nothing behind it at all. One developed example beats three gestured-at ones.',
  },
  voice_and_style: {
    score: 4,
    comment:
      'You sound like a person, which is rarer than you would think, and the last line earns its confidence. The essay slips between third person and "we" three times; pick a stance and hold it.',
  },
  grammar_and_mechanics: {
    score: 3,
    comment:
      'One clear error ("shared to"), and a pattern of passive constructions that let the sentences avoid naming who acts. See the assistant marks in the essay for each one.',
  },
} as const;

export const REVISION_OVERALL_COMMENT = [
  'This is a real argument, not a five-paragraph performance of one, and the counterargument paragraph is the strongest writing you have done this year — you state the objection in a form its holder would recognize, then answer it. That is the whole skill.',
  '',
  'Two things to fix in the revision. First, move the thesis up: everything before it is throat-clearing, and a reader deciding whether to keep going will not reach it. Second, the shared-article story is your only concrete evidence and it goes by in a single sentence. Slow it down and let it do the work the electoral-college claim is currently pretending to do.',
  '',
  'Fix the point-of-view slips flagged in the essay while you are in there.',
].join('\n');

export const REVISION_OVERALL_SCORE = 4;
export const REVISION_NUMERIC_PERCENTAGE = 88;
export const REVISION_LETTER_GRADE = 'B+';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Draft comments with row ids scoped to one seeded document.
 *
 * The prefix must be unique per seed run: the preview-seat script seeds a
 * separate organization into the same database for every seat, and a shared
 * literal id makes the second seat fail on DocumentComment_pkey.
 */
export function buildRevisionDraftComments(
  idPrefix: string
): SeededDraftComment[] {
  return REVISION_DRAFT_COMMENTS.map((comment) => ({
    ...comment,
    id: `${idPrefix}-draft-comment-${comment.key}`,
  }));
}

/**
 * The essay as HTML, with a `data-comment-id` span around each draft comment's
 * anchor — the same markup the editor writes when a comment is created, so the
 * document and its submission look exactly like real student work rather than
 * like a fixture. Takes the comments so the marks carry the same ids the rows
 * are created with.
 */
export function buildRevisionEssayHtml(
  comments: SeededDraftComment[]
): string {
  return REVISION_ESSAY_PARAGRAPHS.map((paragraph) => {
    let html = escapeHtml(paragraph);
    for (const comment of comments) {
      const anchor = escapeHtml(comment.anchor);
      if (!html.includes(anchor)) continue;
      html = html.replace(
        anchor,
        `<span data-comment-id="${comment.id}">${anchor}</span>`
      );
    }
    return `<p>${html}</p>`;
  }).join('');
}

/** The grammar payload shape the submission column stores. */
export function buildRevisionGrammarIssuesPayload() {
  return {
    issues: REVISION_GRAMMAR_ISSUES.map((issue) => ({
      id: issue.id,
      excerpt: issue.excerpt,
      occurrence: issue.occurrence,
      kind: issue.kind,
      rule: issue.rule,
      message: issue.message,
    })),
  };
}

/**
 * An earlier, visibly worse version of the opening, so document history has
 * something to show and the revision has a before to compare against.
 */
export const REVISION_EARLY_DRAFT_TEXT = [
  'Schools should teach civic responsibility better. There are many reasons why this is important for students today.',
  '',
  'In this essay I will talk about three changes that schools could make to prepare students to be citizens.',
].join('\n\n');

/**
 * A pre-writing conversation for the graded document's first module, so the
 * tutor column shows a real exchange instead of a single canned opener. Agent
 * values match what /api/domain/tutor-response writes.
 */
export const REVISION_TUTOR_EXCHANGE: Array<{
  agent: 'user' | 'assistant';
  content: string;
}> = [
  {
    agent: 'user',
    content:
      'ok so the prompt is how schools can prepare students for civic responsibility. my first thought is just "teach more government class" but that feels boring and also i dont think its true? i had government last year and i could not tell you one thing about how to actually decide who to vote for.',
  },
  {
    agent: 'assistant',
    content:
      'That is a real observation and it is more interesting than the safe answer. You took a class about government and came out unable to do the thing government asks of you. Say more about that gap — what would the class have had to do differently for you to walk out able to decide?',
  },
  {
    agent: 'user',
    content:
      'i guess we never practiced anything. we memorized the branches and the amendments. we never had to like, actually argue about something where it mattered who won. student council votes on the dance theme lol.',
  },
  {
    agent: 'assistant',
    content:
      'You just said two different things and both are useful. One is about practice versus memorization. The other is about stakes — the dance theme does not cost anybody anything. Which of those feels closer to the center of your argument? You do not have to pick permanently, just for the next five minutes.',
  },
  {
    agent: 'user',
    content:
      'practice. because the stakes thing is really just an example of why the practice is fake. also i keep thinking about my aunt sharing that article that turned out to be corrected already, like nobody in my family checked and these are adults who vote.',
  },
  {
    agent: 'assistant',
    content:
      'Hold onto the article story — that is evidence, and it is yours, which means nobody else in your class has it. Right now you have three candidates for what schools should practice: checking a source, making a decision that costs something, and arguing with someone you disagree with. Try writing one sentence that names all three. That sentence is probably your thesis.',
  },
  {
    agent: 'user',
    content:
      'schools should stop treating citizenship like a unit you memorize and start treating it like a skill you rehearse — checking sources, making real decisions, and arguing fairly.',
  },
  {
    agent: 'assistant',
    content:
      'That is a thesis. It is arguable, it is specific, and it tells me the shape of your essay before I read it. One thing to watch as you draft: you will be tempted to spend your best paragraph on the part you find easiest to write. The article story is your hardest and best material. Do not save it for a single sentence.',
  },
];

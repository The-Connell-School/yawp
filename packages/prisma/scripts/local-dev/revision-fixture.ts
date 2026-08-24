/**
 * Full-length graded essays for local development.
 *
 * The sparse one-sentence seeds are fine for asserting that a page renders,
 * but they tell you nothing about how the revision split screen actually
 * reads: whether comments collide, whether the feedback panel scrolls, whether
 * marks land where the student expects, whether an essay with almost no
 * feedback looks broken or calm.
 *
 * So there are three, deliberately different in shape:
 *
 *   civic     — medium essay, medium feedback (9 comments, 8 assistant marks)
 *   dust-bowl — long essay, heavy feedback (11 comments, 6 marks, low grade)
 *   news      — short essay, almost no feedback (2 comments, 0 marks, high grade)
 *
 * Every excerpt below must appear verbatim in its own essay, at the stated
 * occurrence. `revision-fixture.test.ts` enforces that for all three: an
 * excerpt that drifts would otherwise vanish silently from the UI, since both
 * the grade-highlight overlay and the grammar parser drop anchors they cannot
 * resolve.
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

export type FixtureRubricScores = Record<
  string,
  { score: number; comment: string }
>;

export type FixtureTutorMessage = {
  agent: 'user' | 'assistant';
  content: string;
};

export type GradedEssayFixture = {
  /** Used to build stable-but-scoped row ids. Unique across fixtures. */
  key: string;
  title: string;
  paragraphs: string[];
  /**
   * Inline comments left on the draft while it was being written, with the
   * student's replies — the marks the revision screen deliberately does not
   * repeat on the working copy.
   */
  draftComments: FixtureDraftComment[];
  teacherComments: FixtureTeacherComment[];
  grammarIssues: FixtureGrammarIssue[];
  rubricScores: FixtureRubricScores;
  overallComment: string;
  overallScore: number;
  numericPercentage: number;
  letterGrade: string;
  /** Days before now the essay was turned in. */
  submittedDaysAgo: number;
  /** Optional worked pre-writing conversation for the first module session. */
  tutorExchange?: FixtureTutorMessage[];
  /** Optional earlier draft, so document history has a before to show. */
  earlyDraftText?: string;
};

// ── 1. Civic essay — medium length, medium feedback ────────────────────

const CIVIC_PARAGRAPHS = [
  'Every four years, adults line up to vote, but almost no one asks where they learned how. Schools teach students to solve for x and to name the branches of government, yet they rarely ask students to practice the harder work of disagreeing well. If schools want to prepare students for civic responsibility, they should stop treating citizenship as a unit in a textbook and start treating it as a skill that has to be rehearsed. Three changes would do the most good: teaching students to evaluate sources, giving them real decisions to make, and grading them on how they argue rather than on who they agree with.',
  'The first change is source evaluation. Most students I know get their news from whatever appears on their phone at seven in the morning. We are not taught to ask who paid for the story, or what got left out of it. In my own family, an article that was later corrected got shared to about forty people before anyone checked the date. A single class period spent tracing one claim back to its origin would teach more about citizenship than a whole chapter about the electoral college, because it builds a habit instead of a fact.',
  'The second change is giving students decisions that actually matter. Student government at my school votes on the theme for a dance. That is fine, but it is not practice for anything. Schools could hand a real budget line to students, even a small one, and let them argue over how to spend it. When the outcome is real, the arguing gets serious, and students learn that a decision costs somebody something. Being forced to choose between two good things is the part of citizenship nobody teaches.',
  'The third change is how we grade argument. In most classes, a persuasive essay is scored on whether it has five paragraphs and a hook. Very few teachers ask whether the writer represented the other side fairly. If we graded students on how accurately they could state the strongest version of an opposing view, we would be training the exact muscle that democracy runs on. It would also make the classroom feel less like a place where you guess what the teacher believes.',
  'Some people would say that schools should stay out of civics because it is too political and parents disagree about it. That worry is real, but it confuses teaching a method with teaching a conclusion. Nobody thinks a science teacher is being political for teaching students how to run a controlled experiment. Teaching a student to check a source, weigh a cost, and state an opponent’s view fairly is a method, not a party.',
  'Schools already claim that they are preparing students for the world. Civic responsibility is not a chapter that a student can memorize the night before; it is a set of habits that only form through repetition. If we spent as much time practicing disagreement as we spend practicing multiplication, my generation would walk into its first election knowing what to do there.',
];

const CIVIC_ESSAY: GradedEssayFixture = {
  key: 'civic',
  title: 'What school owes a first-time voter',
  paragraphs: CIVIC_PARAGRAPHS,
  submittedDaysAgo: 3,
  numericPercentage: 88,
  letterGrade: 'B+',
  overallScore: 4,
  draftComments: [
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
  ],
  teacherComments: [
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
  ],
  grammarIssues: [
    {
      id: 'person-shift',
      excerpt: 'We are not taught to ask who paid for the story',
      occurrence: 1,
      kind: 'style',
      rule: 'Consistent point of view',
      message:
        'The essay has been describing students in the third person, and this sentence switches to "we." Choose one point of view and keep it for the whole essay.',
    },
    {
      id: 'preposition',
      excerpt: 'got shared to about forty people',
      occurrence: 1,
      kind: 'error',
      rule: 'Preposition choice',
      message:
        'Something is shared *with* people, not *to* them. Consider: "was shared with about forty people."',
    },
    {
      id: 'passive-got',
      excerpt: 'an article that was later corrected got shared',
      occurrence: 1,
      kind: 'style',
      rule: 'Passive voice',
      message:
        'Two passive constructions stack up here, so the sentence never says who did anything. Who shared it?',
    },
    {
      id: 'vague-anything',
      excerpt: 'That is fine, but it is not practice for anything.',
      occurrence: 1,
      kind: 'style',
      rule: 'Vague reference',
      message:
        '"Anything" leaves the reader to guess. Practice for what — a budget vote, a jury, an election?',
    },
    {
      id: 'nominalization',
      excerpt: 'the arguing gets serious',
      occurrence: 1,
      kind: 'style',
      rule: 'Nominalization',
      message:
        '"The arguing" turns a verb into a thing and drains the energy out of it. Try "students argue seriously."',
    },
    {
      id: 'passive-scored',
      excerpt:
        'a persuasive essay is scored on whether it has five paragraphs and a hook',
      occurrence: 1,
      kind: 'style',
      rule: 'Passive voice',
      message:
        'Passive voice hides the actor. Teachers score the essay — say so, since your argument is about what teachers should do differently.',
    },
    {
      id: 'vague-attribution',
      excerpt: 'Some people would say',
      occurrence: 1,
      kind: 'style',
      rule: 'Vague attribution',
      message:
        '"Some people" is an anonymous opponent, which makes the counterargument easier to knock down than it should be. Name who actually says this.',
    },
    {
      id: 'wordiness',
      excerpt: 'Schools already claim that they are preparing students',
      occurrence: 1,
      kind: 'style',
      rule: 'Wordiness',
      message:
        'Five words do one word’s work. "Schools already claim to prepare students" says the same thing faster.',
    },
  ],
  rubricScores: {
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
  },
  overallComment: [
    'This is a real argument, not a five-paragraph performance of one, and the counterargument paragraph is the strongest writing you have done this year — you state the objection in a form its holder would recognize, then answer it. That is the whole skill.',
    '',
    'Two things to fix in the revision. First, move the thesis up: everything before it is throat-clearing, and a reader deciding whether to keep going will not reach it. Second, the shared-article story is your only concrete evidence and it goes by in a single sentence. Slow it down and let it do the work the electoral-college claim is currently pretending to do.',
    '',
    'Fix the point-of-view slips flagged in the essay while you are in there.',
  ].join('\n'),
  earlyDraftText: [
    'Schools should teach civic responsibility better. There are many reasons why this is important for students today.',
    '',
    'In this essay I will talk about three changes that schools could make to prepare students to be citizens.',
  ].join('\n\n'),
  tutorExchange: [
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
  ],
};

// ── 2. Dust Bowl — long essay, heavy feedback, low grade ───────────────

const DUST_BOWL_PARAGRAPHS = [
  'The Dust Bowl is usually taught as weather. A drought came, the wind took the topsoil, and families drove west. That version is easy to remember and it leaves out the decision that made the disaster possible. Between 1914 and 1930, farmers plowed up more than thirty million acres of grassland that had never been broken before. The drought was the trigger. The plowing was the gun.',
  'The grass that covered the southern plains had roots that went down several feet. Those roots held the soil in place through dry years, and the southern plains had always had dry years. When wheat prices rose during the First World War, farmers replaced that grass with a crop whose roots reach about a foot down. For a decade the rain cooperated and the gamble looked smart.',
  'It is tempting to blame the farmers, and my first draft did. That is too easy. Federal policy encouraged them to plow, the railroads advertised the plains as reliably wet, and a farmer who refused to expand was outbid by neighbors who did. Individual choices were rational. Added together, they stripped the plains of the only thing holding them down.',
  'The government understood this by 1935, which is the part that gets left out of the weather story. The Soil Conservation Service paid farmers a dollar an acre to try contour plowing and cover crops. More than two hundred million trees were planted as windbreaks. The dust did not stop because the rain returned; it slowed because people changed what they did with the ground.',
  'Some textbooks still describe the Dust Bowl as a natural disaster. This matters beyond history class. If a catastrophe is natural, nobody is accountable and nothing needs to change. If it followed from decisions, then decisions can be made differently next time, which is a harder and more useful lesson.',
  'The strongest objection to my argument is that the drought of the 1930s was genuinely extreme, and no farming practice would have prevented all damage. This is fair. Grassland would have suffered too. But the difference between damaged land and land that blows away entirely is the difference between a hard decade and an exodus.',
  'The Dust Bowl was not a storm that happened to people. It was a bill that came due.',
];

const DUST_BOWL_ESSAY: GradedEssayFixture = {
  key: 'dust-bowl',
  title: 'The quiet part of the Dust Bowl',
  paragraphs: DUST_BOWL_PARAGRAPHS,
  submittedDaysAgo: 11,
  numericPercentage: 74,
  letterGrade: 'C',
  overallScore: 3,
  draftComments: [
    {
      key: 'sources',
      anchor: 'Between 1914 and 1930',
      content:
        'Every number in this paragraph needs a source before you turn it in. Which of your three readings did these come from?',
      responses: [
        'The acreage is from the Worster book. I could not find where I got the tree number.',
      ],
    },
    {
      key: 'blame',
      anchor: 'It is tempting to blame the farmers',
      content:
        'This is the paragraph where the essay gets interesting. Do not rush it.',
    },
  ],
  teacherComments: [
    {
      excerpt: 'The Dust Bowl is usually taught as weather.',
      occurrence: 1,
      content:
        'Opening with the version you are about to argue against is the right structural choice. It gives the reader something to push off.',
    },
    {
      excerpt: 'The drought was the trigger. The plowing was the gun.',
      occurrence: 1,
      content:
        'Best sentence in the essay. It is also, right now, the only place your thesis appears in a form I could quote back to you. Consider whether it belongs at the end of the paragraph or the start.',
    },
    {
      excerpt:
        'more than thirty million acres of grassland that had never been broken before',
      occurrence: 1,
      content:
        'Source. This number is load-bearing for the entire argument and it arrives unattributed. Cite it in the text, not just the bibliography.',
    },
    {
      excerpt: 'a crop whose roots reach about a foot down',
      occurrence: 1,
      content:
        'The root-depth contrast is the clearest explanatory move in the paper — several feet against about a foot. Give the grass figure the same precision you gave the wheat.',
    },
    {
      excerpt: 'It is tempting to blame the farmers, and my first draft did.',
      occurrence: 1,
      content:
        'Telling the reader you changed your mind is a real move and most students will not make it. Keep it.',
    },
    {
      excerpt: 'Individual choices were rational.',
      occurrence: 1,
      content:
        'This is the most sophisticated idea in the paper: rational individual decisions producing a collective catastrophe. It gets four words. It deserves the paragraph you spent on the Soil Conservation Service.',
    },
    {
      excerpt: 'paid farmers a dollar an acre',
      occurrence: 1,
      content:
        'Cite this, and tell me the year the payments started — you say 1935 in the previous sentence but it is not clear the two are the same date.',
    },
    {
      excerpt:
        'More than two hundred million trees were planted as windbreaks.',
      occurrence: 1,
      content:
        'You told me in conference you could not find where this figure came from. If you cannot source it before the revision is due, cut it. An unsourced number weakens the sourced ones next to it.',
    },
    {
      excerpt:
        'If a catastrophe is natural, nobody is accountable and nothing needs to change.',
      occurrence: 1,
      content:
        'This is your thesis restated at a higher level, and it is better than your actual thesis. Strongly consider opening the essay near here.',
    },
    {
      excerpt:
        'The strongest objection to my argument is that the drought of the 1930s was genuinely extreme',
      occurrence: 1,
      content:
        'Good — you state the objection in its strongest form instead of an easy version, then answer it with a distinction rather than a dismissal. This paragraph is doing what the assignment asked.',
    },
    {
      excerpt: 'It was a bill that came due.',
      occurrence: 1,
      content:
        'Strong last line. It will land twice as hard once the two figures above it are cited.',
    },
  ],
  grammarIssues: [
    {
      id: 'comma-splice',
      excerpt:
        'That version is easy to remember and it leaves out the decision',
      occurrence: 1,
      kind: 'error',
      rule: 'Comma before a coordinating conjunction',
      message:
        'Two independent clauses joined by "and" take a comma before it: "easy to remember, and it leaves out."',
    },
    {
      id: 'intro-comma',
      excerpt: 'For a decade the rain cooperated',
      occurrence: 1,
      kind: 'error',
      rule: 'Comma: introductory phrases',
      message:
        'An introductory phrase takes a comma after it: "For a decade, the rain cooperated."',
    },
    {
      id: 'expletive',
      excerpt: 'It is tempting to blame the farmers',
      occurrence: 1,
      kind: 'style',
      rule: 'Expletive construction',
      message:
        '"It is" openers delay the subject. "Blaming the farmers is tempting" puts the idea first.',
    },
    {
      id: 'vague-this',
      excerpt: 'This is fair.',
      occurrence: 1,
      kind: 'style',
      rule: 'Vague reference',
      message:
        'A "this" with no noun after it makes the reader look back. "This objection is fair" costs one word and removes the work.',
    },
    {
      id: 'passive-trees',
      excerpt: 'More than two hundred million trees were planted as windbreaks',
      occurrence: 1,
      kind: 'style',
      rule: 'Passive voice',
      message:
        'Passive voice hides who acted, and who acted is your argument: the government planted them.',
    },
    {
      id: 'wordy-clause',
      excerpt: 'which is the part that gets left out of the weather story',
      occurrence: 1,
      kind: 'style',
      rule: 'Wordiness',
      message:
        'Eleven words for one idea. "which the weather story leaves out" says it in five.',
    },
  ],
  rubricScores: {
    thesis_and_content: {
      score: 4,
      comment:
        'The argument — that the Dust Bowl was a consequence of decisions rather than an act of weather — is genuinely arguable and you sustain it to the end. The best statement of it is buried in paragraph five rather than the introduction.',
    },
    organization_and_structure: {
      score: 4,
      comment:
        'Cause, mechanism, complication, response, stakes, objection, close. The sequence is sound. Paragraph three is the one carrying the most weight and the one you give the least room.',
    },
    evidence_and_support: {
      score: 2,
      comment:
        'Three specific figures, none cited in the text, and one you have told me you cannot source. This is the difference between a C and a B on this assignment, and it is entirely fixable in a revision — the reading is done, the citations just are not on the page.',
    },
    voice_and_style: {
      score: 4,
      comment:
        'Confident and unusually plain. The gun metaphor and the closing bill both land, and neither is overwritten. Watch a habit of opening sentences with "It is."',
    },
    grammar_and_mechanics: {
      score: 3,
      comment:
        'Two comma errors that repeat, and a run of passive constructions in the paragraph where naming the actor matters most. All flagged in the essay.',
    },
  },
  overallComment: [
    'The history in this paper is better than the grade. You understood something most students in this unit did not: that a catastrophe can follow from ordinary, individually reasonable decisions, and that calling it "natural" is a way of not asking who decided. Paragraph three is the real contribution and paragraph six answers the strongest objection honestly.',
    '',
    'The grade is where it is because the evidence is not on the page. Three figures carry your argument and none of them is cited in the text; one of them you have already told me you cannot find. A reader who doubts you has nothing to check. That is a revision problem, not a research problem — you have done the reading.',
    '',
    'For the revision: cite the acreage and the payment figure, cut or source the tree number, and try opening the essay from the "if a catastrophe is natural" idea. Give paragraph three the room you currently spend on the Soil Conservation Service.',
  ].join('\n'),
  earlyDraftText: [
    'The Dust Bowl was a very important event in American history that affected many people in the 1930s.',
    '',
    'It was caused by a drought and bad farming practices, and it made a lot of families move to California.',
  ].join('\n\n'),
};

// ── 3. News essay — short, almost no feedback, high grade ──────────────

const NEWS_PARAGRAPHS = [
  'For most of last year I read the news the way other people bite their nails. I checked before school, between classes, and in bed. I could tell you what had happened everywhere and what I thought about almost none of it.',
  'In February I quit for a month as an experiment. The first week was genuinely unpleasant. I kept reaching for my phone and finding nothing to do with it, and I felt less informed than my friends, which turned out to be the part worth examining.',
  'What I noticed by the third week was that almost nothing I had been reading had ever required anything of me. I could not vote yet. I did not live in most of the places I read about. The reading had felt like participation, and it was closer to spectating.',
  'I am not arguing that people should stop paying attention. That would be a stupid conclusion and an easy one. I am arguing that attention is a budget, and I had been spending mine on the parts of the world I could do the least about, while the school board that decides my school schedule met eleven times without me noticing.',
  'I read the news again now, about twice a week, and I read my town paper first. It is less exciting. It is also the only part of it I can actually act on.',
];

const NEWS_ESSAY: GradedEssayFixture = {
  key: 'news',
  title: 'Why I stopped reading the news',
  paragraphs: NEWS_PARAGRAPHS,
  submittedDaysAgo: 6,
  numericPercentage: 96,
  letterGrade: 'A',
  overallScore: 5,
  draftComments: [],
  teacherComments: [
    {
      excerpt: 'I read the news the way other people bite their nails',
      occurrence: 1,
      content:
        'One line and I know the whole relationship. This is the kind of opening you cannot plan; keep whatever you did to get here.',
    },
    {
      excerpt: 'attention is a budget',
      occurrence: 1,
      content:
        'Here is where the essay stops being an anecdote and becomes an argument. The school board detail right after it is what makes the claim impossible to wave away.',
    },
  ],
  // Deliberately empty: the panel's "no assistant notes" state should look
  // calm and intentional, not broken, and only a real essay shows whether it
  // does.
  grammarIssues: [],
  rubricScores: {
    thesis_and_content: {
      score: 5,
      comment:
        'The claim is specific, personal, and genuinely contestable — that attention spent on what you cannot affect is attention misspent. You also refuse the lazier version of your own argument in paragraph four, which is what earns the top score.',
    },
    organization_and_structure: {
      score: 5,
      comment:
        'Habit, experiment, observation, argument, resolution. Five paragraphs, no wasted movement, and the shortest one is the last because it should be.',
    },
    evidence_and_support: {
      score: 4,
      comment:
        'The eleven school board meetings do more work than any statistic could. The only thing missing is what happened after you started reading the town paper — one concrete result would close the loop.',
    },
    voice_and_style: {
      score: 5,
      comment:
        'Controlled throughout. "It is less exciting" is the kind of understatement most writers your age reach for and miss.',
    },
    grammar_and_mechanics: {
      score: 5,
      comment: 'Clean. Nothing to flag.',
    },
  },
  overallComment: [
    'This is the best thing you have turned in and I do not have much to fix. The essay knows what it is arguing, it argues it, and it stops.',
    '',
    'The one place to push in a revision: you tell me you read the town paper now, but not what came of it. Did you go to a school board meeting? Did anything change? One concrete consequence would turn a good essay into one you could submit somewhere.',
  ].join('\n'),
};

export const GRADED_ESSAY_FIXTURES: GradedEssayFixture[] = [
  CIVIC_ESSAY,
  DUST_BOWL_ESSAY,
  NEWS_ESSAY,
];

/** The fixture the revision screen is usually demoed with. */
export const PRIMARY_GRADED_ESSAY = CIVIC_ESSAY;

export function essayText(fixture: GradedEssayFixture): string {
  return fixture.paragraphs.join('\n\n');
}

/**
 * Draft comments with row ids scoped to one seeded document.
 *
 * The prefix must be unique per seed run: the preview-seat script seeds a
 * separate organization into the same database for every seat, and a shared
 * literal id makes the second seat fail on DocumentComment_pkey.
 */
export function buildRevisionDraftComments(
  fixture: GradedEssayFixture,
  idPrefix: string
): SeededDraftComment[] {
  return fixture.draftComments.map((comment) => ({
    ...comment,
    id: `${idPrefix}-${fixture.key}-draft-${comment.key}`,
  }));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The essay as HTML, with a `data-comment-id` span around each draft comment's
 * anchor — the same markup the editor writes when a comment is created, so the
 * document and its submission look exactly like real student work rather than
 * like a fixture. Takes the comments so the marks carry the same ids the rows
 * are created with.
 */
export function buildEssayHtml(
  fixture: GradedEssayFixture,
  comments: SeededDraftComment[]
): string {
  return fixture.paragraphs
    .map((paragraph) => {
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
    })
    .join('');
}

/** The grammar payload shape the submission column stores. */
export function buildGrammarIssuesPayload(fixture: GradedEssayFixture) {
  return {
    issues: fixture.grammarIssues.map((issue) => ({
      id: `${fixture.key}-${issue.id}`,
      excerpt: issue.excerpt,
      occurrence: issue.occurrence,
      kind: issue.kind,
      rule: issue.rule,
      message: issue.message,
    })),
  };
}

export function buildEarlyDraftHtml(fixture: GradedEssayFixture): string | null {
  if (!fixture.earlyDraftText) return null;
  return fixture.earlyDraftText
    .split('\n\n')
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

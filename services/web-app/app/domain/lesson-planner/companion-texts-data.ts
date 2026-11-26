/**
 * Companion texts (Kevin, Nov 26): shorter texts that put the work being taught
 * in conversation with another treatment of the same thematic topic. Not the
 * sources that place a work in its time: those are background, for a context
 * lesson. Filed by thematic topic, in the class-starter library's own words, so
 * one companion serves every work that shares the topic.
 *
 * Rules C1–C8 (docs/plans/2026-11-24-lesson-planner-rules.md). Every text here
 * is real. A public-domain poem is held whole, as transcribed on Wikipedia from
 * its first printing (Nov 26), and is printed and checked from here; anything
 * else is named with where to find it, and the teacher adds their copy.
 * `angle` is for the teacher: how the companion treats the topic, never a
 * line for a slide (R28).
 */

export type CompanionKind = 'poem' | 'story' | 'essay' | 'speech' | 'letter' | 'clip';

export type CompanionText = {
  id: string;
  title: string;
  author: string;
  /** First published. */
  year: number;
  kind: CompanionKind;
  /** Thematic topics, in the class-starter library's words. */
  topics: string[];
  /** For the teacher: how it treats the topic. */
  angle: string;
  /** Work kits (work-visuals) it pairs well with. */
  pairsWith: string[];
  publicDomain: boolean;
  /** The whole text, when Yawp! holds it: printed and checked from here. */
  text?: string;
  /** About the text as held (its spelling, its edition). */
  note?: string;
  /** When it is not held: where the teacher finds it. */
  where?: string;
  /** Hard content the teacher should know about before choosing it (S7). */
  care?: string;
};

export const COMPANION_TEXTS: CompanionText[] = [
  {
    id: "ozymandias",
    title: "Ozymandias",
    author: "Percy Bysshe Shelley",
    year: 1818,
    kind: "poem",
    topics: ["power", "ambition", "time-memory"],
    angle: "A ruler’s boast carved in stone, read by a traveller in an empty desert: what power claims about itself, and what time does to the claim.",
    pairsWith: ["macbeth", "julius-caesar", "the-great-gatsby", "lord-of-the-flies", "animal-farm", "nineteen-eighty-four", "frankenstein"],
    publicDomain: true,
    note: "Text as printed in 1819, with Shelley’s spelling “desart”.",
    text: "I met a traveller from an antique land\nWho said: Two vast and trunkless legs of stone\nStand in the desart. Near them, on the sand,\nHalf sunk, a shattered visage lies, whose frown,\nAnd wrinkled lip, and sneer of cold command,\nTell that its sculptor well those passions read\nWhich yet survive, stamped on these lifeless things,\nThe hand that mocked them and the heart that fed:\nAnd on the pedestal these words appear:\n\"My name is Ozymandias, king of kings:\nLook on my works, ye Mighty, and despair!\"\nNothing beside remains. Round the decay\nOf that colossal wreck, boundless and bare\nThe lone and level sands stretch far away.",
  },
  {
    id: "richard-cory",
    title: "Richard Cory",
    author: "Edwin Arlington Robinson",
    year: 1897,
    kind: "poem",
    topics: ["identity", "suffering", "meaning", "belonging"],
    angle: "A town that envies a rich man from the pavement and never sees him: what wealth looks like from outside, and what it hides.",
    pairsWith: ["the-great-gatsby", "death-of-a-salesman", "a-raisin-in-the-sun", "the-grapes-of-wrath"],
    publicDomain: true,
    care: "The poem ends with a suicide.",
    text: "Whenever Richard Cory went down town,\nWe people on the pavement looked at him:\nHe was a gentleman from sole to crown,\nClean favored, and imperially slim.\n\nAnd he was always quietly arrayed,\nAnd he was always human when he talked;\nBut still he fluttered pulses when he said,\n\"Good-morning,\" and he glittered when he walked.\n\nAnd he was rich – yes, richer than a king –\nAnd admirably schooled in every grace:\nIn fine, we thought that he was everything\nTo make us wish that we were in his place.\n\nSo on we worked, and waited for the light,\nAnd went without the meat, and cursed the bread;\nAnd Richard Cory, one calm summer night,\nWent home and put a bullet through his head.",
  },
  {
    id: "we-wear-the-mask",
    title: "We Wear the Mask",
    author: "Paul Laurence Dunbar",
    year: 1895,
    kind: "poem",
    topics: ["identity", "suffering", "truth"],
    angle: "The face shown to the world and the cries behind it, written by a Black poet in 1895: who wears a mask, and who it is for.",
    pairsWith: ["their-eyes-were-watching-god", "a-raisin-in-the-sun", "the-great-gatsby", "hamlet", "to-kill-a-mockingbird", "frederick-douglass-narrative", "huckleberry-finn"],
    publicDomain: true,
    text: "We wear the mask that grins and lies,\nIt hides our cheeks and shades our eyes,—\nThis debt we pay to human guile;\nWith torn and bleeding hearts we smile,\nAnd mouth with myriad subtleties.\n\nWhy should the world be over-wise,\nIn counting all our tears and sighs?\nNay, let them only see us, while\n       We wear the mask.\n\nWe smile, but, O great Christ, our cries\nTo thee from tortured souls arise.\nWe sing, but oh the clay is vile\nBeneath our feet, and long the mile;\nBut let the world dream otherwise,\n       We wear the mask!",
  },
  {
    id: "invictus",
    title: "Invictus",
    author: "William Ernest Henley",
    year: 1888,
    kind: "poem",
    topics: ["free-will", "suffering"],
    angle: "A speaker who insists he masters his own fate, whatever chance does to him: set against a work where fate or circumstance seems to win.",
    pairsWith: ["macbeth", "sophocles", "romeo-and-juliet", "of-mice-and-men", "the-odyssey", "night"],
    publicDomain: true,
    text: "Out of the night that covers me\nBlack as the pit from pole to pole,\nI thank whatever gods may be\nFor my unconquerable soul.\n\nIn the fell clutch of circumstance,\nI have not winced nor cried aloud.\nUnder the bludgeonings of chance\nMy head is bloody, but unbowed.\n\nBeyond this place of wrath and tears\nLooms but the Horror of the shade,\nAnd yet the menace of the years\nFinds, and shall find, me unafraid.\n\nIt matters not how strait the gate,\nHow charged with punishments the scroll,\nI am the master of my fate:\nI am the captain of my soul.",
  },
  {
    id: "out-out",
    title: "“Out, Out—”",
    author: "Robert Frost",
    year: 1916,
    kind: "poem",
    topics: ["loss", "meaning", "time-memory"],
    angle: "A boy’s sudden death on a farm and the people who turn back to their work; its title is Macbeth’s “Out, out, brief candle.”",
    pairsWith: ["macbeth", "of-mice-and-men", "the-things-they-carried"],
    publicDomain: true,
    care: "A child is injured and dies.",
    text: "The buzz saw snarled and rattled in the yard\nAnd made dust and dropped stove-length sticks of wood,\nSweet-scented stuff when the breeze drew across it.\nAnd from there those that lifted eyes could count\nFive mountain ranges one behind the other\nUnder the sunset far into Vermont.\nAnd the saw snarled and rattled, snarled and rattled,\nAs it ran light, or had to bear a load.\nAnd nothing happened: day was all but done.\nCall it a day, I wish they might have said\nTo please the boy by giving him the half hour\nThat a boy counts so much when saved from work.\nHis sister stood beside him in her apron\nTo tell them ‘Supper.’ At the word, the saw,\nAs if to prove saws knew what supper meant,\nLeaped out at the boy’s hand, or seemed to leap—\nHe must have given the hand. However it was,\nNeither refused the meeting. But the hand!\nThe boy’s first outcry was a rueful laugh,\nAs he swung toward them holding up the hand\nHalf in appeal, but half as if to keep\nThe life from spilling. Then the boy saw all—\nSince he was old enough to know, big boy\nDoing a man’s work, though a child at heart—\nHe saw all spoiled. ‘Don’t let him cut my hand off—\nThe doctor, when he comes. Don’t let him, sister!’\nSo. But the hand was gone already.\nThe doctor put him in the dark of ether.\nHe lay and puffed his lips out with his breath.\nAnd then—the watcher at his pulse took fright.\nNo one believed. They listened at his heart.\nLittle—less—nothing!—and that ended it.\nNo more to build on there. And they, since they\nWere not the one dead, turned to their affairs.",
  },
  {
    id: "fire-and-ice",
    title: "Fire and Ice",
    author: "Robert Frost",
    year: 1920,
    kind: "poem",
    topics: ["morality", "change"],
    angle: "Desire and hate as two ways a world could end: which destroys more, wanting or hating?",
    pairsWith: ["macbeth", "romeo-and-juliet", "lord-of-the-flies", "frankenstein", "the-great-gatsby", "othello"],
    publicDomain: true,
    text: "Some say the world will end in fire,\n    Some say in ice.\nFrom what I’ve tasted of desire\nI hold with those who favor fire.\n    But if it had to perish twice,\nI think I know enough of hate\n    To say that for destruction ice\nIs also great\n    And would suffice.",
  },
  {
    id: "nothing-gold-can-stay",
    title: "Nothing Gold Can Stay",
    author: "Robert Frost",
    year: 1923,
    kind: "poem",
    topics: ["change", "time-memory", "loss"],
    angle: "The first gold of a thing, and how fast it goes: can anything first and best last?",
    pairsWith: ["the-great-gatsby", "the-outsiders", "the-catcher-in-the-rye", "romeo-and-juliet"],
    publicDomain: true,
    text: "Nature's first green is gold,\nHer hardest hue to hold.\nHer early leaf's a flower;\nBut only so an hour.\nThen leaf subsides to leaf.\nSo Eden sank to grief,\nSo dawn goes down to day.\nNothing gold can stay.",
  },
  {
    id: "the-second-coming",
    title: "The Second Coming",
    author: "W. B. Yeats",
    year: 1920,
    kind: "poem",
    topics: ["change", "power", "morality"],
    angle: "A world coming apart after the First World War, where “the best lack all conviction”: what happens when order fails.",
    pairsWith: ["things-fall-apart", "macbeth", "lord-of-the-flies", "animal-farm", "nineteen-eighty-four", "heart-of-darkness"],
    publicDomain: true,
    text: "Turning and turning in the widening gyre\nThe falcon cannot hear the falconer;\nThings fall apart; the centre cannot hold;\nMere anarchy is loosed upon the world,\nThe blood-dimmed tide is loosed, and everywhere\nThe ceremony of innocence is drowned;\nThe best lack all conviction, while the worst\nAre full of passionate intensity.\n\nSurely some revelation is at hand;\nSurely the Second Coming is at hand.\nThe Second Coming! Hardly are those words out\nWhen a vast image out of Spiritus Mundi\nTroubles my sight: somewhere in sands of the desert\nA shape with lion body and the head of a man,\nA gaze blank and pitiless as the sun,\nIs moving its slow thighs, while all about it\nReel shadows of the indignant desert birds.\nThe darkness drops again; but now I know\nThat twenty centuries of stony sleep\nWere vexed to nightmare by a rocking cradle,\nAnd what rough beast, its hour come round at last,\nSlouches towards Bethlehem to be born?",
  },
  {
    id: "if-we-must-die",
    title: "If We Must Die",
    author: "Claude McKay",
    year: 1919,
    kind: "poem",
    topics: ["justice", "freedom", "responsibility"],
    angle: "A sonnet calling the hunted to fight back, written in the summer of 1919’s racist mob violence: when is resistance owed?",
    pairsWith: ["letter-from-birmingham-jail", "sophocles", "to-kill-a-mockingbird", "frederick-douglass-narrative", "night"],
    publicDomain: true,
    text: "If we must die, let it be not like hogs\nHunted and penned in an inglorious spot,\nWhile round us bark the mad and hungry dogs,\nMaking their mock at our accursed lot.\n\nIf we must die, O let us nobly die,\nSo that our precious blood may not be shed\nIn vain; then even the monsters we defy\nShall be constrained to honor us though dead!\n\nO kinsmen! we must meet the common foe!\nThough far outnumbered let us show us brave\nAnd for their thousand blows deal one deathblow!\nWhat though before us lies the open grave?\n\nLike men we'll face the murderous, cowardly pack,\nPressed to the wall, dying, but fighting back!",
  },
  {
    id: "the-negro-speaks-of-rivers",
    title: "The Negro Speaks of Rivers",
    author: "Langston Hughes",
    year: 1921,
    kind: "poem",
    topics: ["identity", "belonging", "time-memory"],
    angle: "One voice that holds thousands of years of a people’s history: where does a self come from?",
    pairsWith: ["their-eyes-were-watching-god", "a-raisin-in-the-sun", "things-fall-apart", "frederick-douglass-narrative"],
    publicDomain: true,
    text: "I've known rivers:\nI've known rivers ancient as the world and older than the\n      flow of human blood in human veins.\n\nMy soul has grown deep like the rivers.\n\nI bathed in the Euphrates when dawns were young.\nI built my hut near the Congo and it lulled me to sleep.\nI looked upon the Nile and raised the pyramids above it.\nI heard the singing of the Mississippi when Abe Lincoln\n     went down to New Orleans, and I've seen its muddy\n     bosom turn all golden in the sunset.\n\nI've known rivers:\nAncient, dusky rivers.\n\nMy soul has grown deep like the rivers.",
  },
  {
    id: "london-blake",
    title: "London",
    author: "William Blake",
    year: 1794,
    kind: "poem",
    topics: ["power", "suffering", "justice", "freedom"],
    angle: "A walk through a city where every face is marked by its institutions, and “mind-forg’d manacles”: who is to blame for suffering?",
    pairsWith: ["great-expectations", "a-tale-of-two-cities", "frankenstein", "nineteen-eighty-four", "the-scarlet-letter", "brave-new-world"],
    publicDomain: true,
    note: "Blake’s 1794 punctuation and spelling.",
    text: "I wander thro’ each charter’d street,\nNear where the charter’d Thames does flow.\nAnd mark in every face I meet\nMarks of weakness, marks of woe.\n\nIn every cry of every Man,\nIn every Infants cry of fear,\nIn every voice: in every ban,\nThe mind-forg’d manacles I hear\n\nHow the Chimney-sweepers cry\nEvery blackning Church appalls,\nAnd the hapless Soldiers sigh\nRuns in blood down Palace walls\n\nBut most thro’ midnight streets I hear\nHow the youthful Harlots curse\nBlasts the new-born Infants tear\nAnd blights with plagues the Marriage hearse.",
  },
  {
    id: "a-dream-within-a-dream",
    title: "A Dream Within a Dream",
    author: "Edgar Allan Poe",
    year: 1849,
    kind: "poem",
    topics: ["time-memory", "loss", "truth"],
    angle: "Sand running through the fingers: can anything real be held, or is it all a dream?",
    pairsWith: ["the-great-gatsby", "edgar-allan-poe", "death-of-a-salesman", "the-catcher-in-the-rye"],
    publicDomain: true,
    text: "Take this kiss upon the brow!\nAnd, in parting from you now,\nThus much let me avow—\nYou are not wrong, who deem\nThat my days have been a dream;\nYet if hope has flown away\nIn a night, or in a day,\nIn a vision, or in none,\nIs it therefore the less gone?\nAll that we see or seem\nIs but a dream within a dream.\n\nI stand amid the roar\nOf a surf-tormented shore,\nAnd I hold within my hand\nGrains of the golden sand—\nHow few! yet how they creep\nThrough my fingers to the deep,\nWhile I weep—while I weep!\nO God! can I not grasp\nThem with a tighter clasp?\nO God! can I not save\nOne from the pitiless wave?\nIs all that we see or seem\nBut a dream within a dream?",
  },
  {
    id: "civil-disobedience",
    title: "Resistance to Civil Government (“Civil Disobedience”)",
    author: "Henry David Thoreau",
    year: 1849,
    kind: "essay",
    topics: ["justice", "responsibility", "morality", "freedom"],
    angle: "A man who goes to jail rather than pay a tax to a government that allows slavery: when must a conscience break a law?",
    pairsWith: ["sophocles", "letter-from-birmingham-jail", "the-crucible", "to-kill-a-mockingbird", "huckleberry-finn"],
    publicDomain: true,
    where: "Public domain; Project Gutenberg ebook #71. Choose one or two paragraphs (the one beginning “Unjust laws exist” works well).",
  },
  {
    id: "the-prince-17",
    title: "The Prince, chapter 17: whether it is better to be loved than feared",
    author: "Niccolò Machiavelli",
    year: 1532,
    kind: "essay",
    topics: ["power", "ambition", "morality"],
    angle: "Advice to a ruler that it is safer to be feared than loved, if he cannot be both.",
    pairsWith: ["macbeth", "julius-caesar", "lord-of-the-flies", "animal-farm", "othello"],
    publicDomain: true,
    where: "Public domain in W. K. Marriott’s 1908 translation; Project Gutenberg ebook #1232, chapter XVII.",
  },
  {
    id: "story-of-an-hour",
    title: "The Story of an Hour",
    author: "Kate Chopin",
    year: 1894,
    kind: "story",
    topics: ["freedom", "identity", "love"],
    angle: "A wife who hears her husband has died and feels, under the grief, something like freedom.",
    pairsWith: ["the-great-gatsby", "their-eyes-were-watching-god", "the-scarlet-letter", "pride-and-prejudice", "jane-eyre"],
    publicDomain: true,
    where: "Public domain, about 1,000 words; in most American literature anthologies.",
    care: "It turns on a death and ends with one.",
  },
  {
    id: "fourth-of-july",
    title: "What to the Slave Is the Fourth of July?",
    author: "Frederick Douglass",
    year: 1852,
    kind: "speech",
    topics: ["justice", "freedom", "truth"],
    angle: "A speech to a white audience celebrating liberty, asking what their holiday means to the enslaved.",
    pairsWith: ["letter-from-birmingham-jail", "frederick-douglass-narrative", "huckleberry-finn", "to-kill-a-mockingbird"],
    publicDomain: true,
    where: "Public domain; printed in the appendix of Douglass’s My Bondage and My Freedom (1855), Project Gutenberg ebook #202. Use an excerpt.",
  },
  {
    id: "letter-birmingham-companion",
    title: "Letter from Birmingham Jail",
    author: "Martin Luther King Jr.",
    year: 1963,
    kind: "letter",
    topics: ["justice", "responsibility", "morality"],
    angle: "A minister in jail answering clergy who called his protest “unwise and untimely”: just and unjust laws, and why waiting is not neutral.",
    pairsWith: ["sophocles", "the-crucible", "to-kill-a-mockingbird", "huckleberry-finn"],
    publicDomain: false,
    where: "In copyright (the King estate); in most American literature anthologies. Add your copy’s pages with the paperclip.",
  },
  {
    id: "the-lottery",
    title: "The Lottery",
    author: "Shirley Jackson",
    year: 1948,
    kind: "story",
    topics: ["morality", "justice", "belonging", "responsibility"],
    angle: "A village that keeps an old ritual every June: what a community will do because it always has.",
    pairsWith: ["chronicle-death-foretold", "the-crucible", "lord-of-the-flies", "night", "the-giver"],
    publicDomain: false,
    where: "In copyright; first printed in The New Yorker, June 26, 1948, and in most short-story anthologies. Add your copy’s pages with the paperclip.",
    care: "A woman is stoned to death at the end.",
  },
  {
    id: "harlem",
    title: "Harlem",
    author: "Langston Hughes",
    year: 1951,
    kind: "poem",
    topics: ["ambition", "justice", "suffering"],
    angle: "“What happens to a dream deferred?” in eleven lines of images.",
    pairsWith: ["a-raisin-in-the-sun", "the-great-gatsby", "of-mice-and-men", "death-of-a-salesman", "their-eyes-were-watching-god"],
    publicDomain: false,
    where: "In copyright; in most poetry anthologies. Add your copy with the paperclip.",
  },
];

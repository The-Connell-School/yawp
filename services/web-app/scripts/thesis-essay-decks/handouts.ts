/**
 * The words on the handouts that replace the rest of Brian's uploads to the
 * Thesis-Driven Essay's Trainings: his Animal Farm essay, the Critical Essay
 * Form, his sample essay prompts, and the quoting and citing handout. Each is
 * his text, word for word, apart from typos; the YAWP! look comes from
 * render-lesson-plan.ts. Rich text: `**bold**`, `__italic__`.
 */

/**
 * "Sample Essay (Animal Farm)" in the Lesson 1 resources: a literary essay
 * Brian wrote as a model, with a student's heading.
 */
export const ANIMAL_FARM_ESSAY = {
  title:
    'The Silence After Snowball: How One Pig’s Escape Left the Animals Defenseless in Animal Farm',
  heading: ['Brian Connell', 'English 9', 'Mr. Maher'],
  thesis:
    'When Snowball flees the farm without a fight, he leaves the common animals intellectually defenseless, exposing loyal but simple-minded creatures like Boxer and Clover to Napoleon’s manipulation.',
  paragraphs: [
    'Revolutions are supposed to make things better. In George Orwell’s novella Animal Farm, the animals overthrow their cruel human owner, Mr. Jones, hoping to create a fair society where all animals are equal. Things go wrong quickly, however, when the pigs take over, and one pig in particular, Napoleon, becomes a dictator worse than Jones ever was. The turning point in the story comes when Napoleon’s guard dogs chase Snowball, the other leading pig, off the farm. Snowball doesn’t fight back or even say anything to the other animals. He just runs away and never comes back. Most readers focus on how cruel Napoleon is in this scene, but there’s something else worth noticing: what disappears when Snowball leaves. When Snowball flees the farm without a fight, he leaves the common animals intellectually defenseless, exposing loyal but simple-minded creatures like Boxer and Clover to Napoleon’s manipulation.',
    'Snowball’s flight from the farm happens so fast that no one has time to react. Napoleon makes a “high-pitched whimper,” and suddenly nine huge dogs charge into the barn. Snowball runs. He “slipped through a hole in the hedge and was seen no more.” He does not give a speech or a call to action, or make an attempt to rally the animals who had just voted for his windmill plan. Before this moment, Snowball had been the farm’s big thinker, organizing reading classes, designing the windmill, and debating Napoleon in public. When Snowball spoke, the animals saw that ideas could be challenged. But in the moment that mattered most, he chose silence. Maybe running was his only choice since the dogs would have killed him. But by leaving without giving the other animals any words to hold onto, Snowball abandons them.',
    'Without Snowball, the common animals become intellectually defenseless. Before his expulsion, Snowball had given them something they didn’t even realize they needed: a voice that could push back against Napoleon. Now that voice is gone. The animals stand “too amazed and frightened to speak” after watching the attack, and that silence never really ends. They have no one to help them process what they saw or put their confused feelings into words. Orwell shows us animals who sense that something terrible has happened but lack the language to describe it or the confidence to challenge it. The problem isn’t that they’re stupid. The problem is that thinking critically is a skill, and the one animal who had that skill just disappeared through a hole in the hedge.',
    'This defenselessness hits Boxer and Clover hardest because their loyalty and simple-mindedness make them especially vulnerable. Boxer lives by two sayings: “I will work harder” and “Napoleon is always right.” He’s a good animal with a huge heart, but he doesn’t know how to question authority. When things don’t make sense, he blames his own brain rather than doubting the pigs. His loyalty, which could have powered a resistance if someone had organized it, instead flows directly to whoever holds power. Clover is a little smarter. She thinks that “these scenes of terror and slaughter were not what they had looked forward to on that night when old Major first stirred them to rebellion.” She knows this isn’t what they fought for. But Clover can only read four letters of the alphabet. She can feel that something has gone terribly wrong, but feeling it isn’t enough to change anything.',
    'Napoleon wastes no time exploiting this vulnerability. Immediately after Snowball’s expulsion, Squealer begins rewriting history, telling the animals that Snowball “was no better than a criminal.” The animals feel uncomfortable because they remember Snowball fighting bravely at the Battle of the Cowshed. Boxer even speaks up: “I do not believe that Snowball was a traitor at the beginning… He fought bravely at the Battle of the Cowshed. I saw him myself.” But Squealer talks so confidently that Boxer’s certainty fades. Later, Napoleon takes credit for the windmill plans that obviously belonged to Snowball. The animals sense the lie, but they can’t prove it. Step by step, Napoleon erases Snowball from history and replaces the truth with his own version. Every time the animals feel doubt, Squealer explains it away, and no one can argue back.',
    'What would have happened if Snowball had turned around at the hedge and shouted the truth to the animals? What if he had pointed at Napoleon’s dogs and called them what they were: weapons of a dictator? Perhaps the animals would have risen up together, and the story would have ended differently. Or maybe the dogs would have torn Snowball apart before he finished a single sentence. We’ll never know, because Snowball ran without a word. Perhaps Orwell wants us to see that bad leaders don’t win just because they’re strong. They win because no one is left to speak for people who can’t speak for themselves. In the end, the real lesson may be that being good isn’t enough to protect yourself from evil. Loyal, hardworking people who lack the ability to think critically will always be vulnerable to leaders who know how to exploit that trust.',
  ],
} as const;

/**
 * "Critical Essay Form" in the Lesson 1 resources: the essay's shape as an
 * hourglass, introduction narrowing to the thesis, body paragraphs, and the
 * conclusion widening out.
 */
export const ESSAY_FORM = {
  overview:
    'Essays come in many shapes and styles, but this is a great option for organizing a thesis-driven, critical essay.',
  introduction: {
    label: 'Introduction',
    openings: ['Definition', 'Illustrative Story', 'Rhetorical Question', 'Quote', 'Text, Author'],
    note: 'Introduce your essay somewhat generally, and then narrow your discussion toward your thesis statement.',
  },
  thesis: {
    label: 'Thesis statement',
    note: 'This is maybe the most important part of your essay. A thesis statement is a single sentence that expresses the main idea, focus, or argument of the essay. In this model, **it’s the last sentence of your intro.**',
  },
  body: {
    paragraphs: ['Body Paragraph 1', 'Body Paragraph 2', 'Body Paragraph 3', 'Body Paragraph 4'],
    note: 'Use your body paragraphs to explore, define, and prove specific points from your thesis statement. There is no rule about how many body paragraphs you should have, but it’s good to aim for at least three.',
  },
  conclusion: {
    label: 'Conclusion',
    moves: ['Rhetorical Question', 'Callback to Earlier Point', 'Solutions to Issues', 'Big, bold closing statement'],
    note: 'Use your final paragraph to draw conclusions based on everything you just said and to make a graceful exit from the discussion.',
  },
} as const;

/** "Sample Thesis-Driven Essay Prompts" in the Lesson 2 resources. */
export const ESSAY_PROMPTS = {
  intro:
    'Here are some essay prompts that we’ve had success with — feel free to use or adapt these or to create your own. The key with essay prompts is to give students freedom to explore some aspect of the topic that they’re interested in. This allows them not only to write about something they care about, but also gives them space to critically think and develop a position (instead of being forced into a topic/argument assigned by the teacher).',
  organized:
    'Your essay should be organized formally, with an introduction, thesis statement, body paragraphs, and a conclusion.',
  prompts: [
    {
      heading: 'A problem in your community',
      paragraphs: [
        'Write an essay about a problem in your community and how we might solve it. “Community” might refer to your neighborhood, school, grade, city, state, country, age group, race, gender, or any other group you belong to. Your essay can focus on any problems that you see or feel. Use your personal experience and observations to develop your position, and evidence from your own experience to support your ideas. How do you propose we solve this problem?',
      ],
    },
    {
      heading: 'The novel you just read',
      paragraphs: [
        'Write a critical essay about [the novel we just read for class]. You can choose any aspect of the novel that interests you. Consider the themes we’ve discussed, the characters, the settings, or anything you’ve noticed about the story that you think is worthy of discussion.',
        'Use your observations and opinions to develop your position, and quotations from the book to support your ideas.',
      ],
    },
    {
      heading: 'A problem in education',
      paragraphs: [
        'Write a critical essay that discusses a problem in education. Use your personal experience and observations to develop your position, and evidence from your own experience to support your ideas. How do you propose we solve this problem?',
      ],
    },
    {
      heading: 'What gives you hope',
      paragraphs: [
        'Write an essay about what gives you hope in the world today. When you look around at the world and all of its complexity, and you look ahead to the future, what gives you hope? You might identify problems that you believe you and your generation can solve, changes or innovations that you look forward to, or people/things that inspire your hope in the face of adversity.',
        'Your essay can include how you define hope, what hope looks like for you personally, or the role hope plays in shaping the state of the world today. You might consider the quote, “If despair creates problems, hope can achieve the impossible.” You may use your personal experiences and observations to develop your stance, and evidence from your own life to support your ideas. In some cases, you may use outside sources to support your ideas.',
      ],
    },
  ],
} as const;

/**
 * "HANDOUT: Citing/Integrating Quotations" in the Lesson 5 resources: Purdue
 * OWL's "Quoting Others", then YAWP!'s own page on citing sources.
 */
export const QUOTING_HANDOUT = {
  overview:
    'How to bring someone else’s words into your essay, explain them, and give them credit. Part 1 is from Purdue University’s Online Writing Lab, an excellent resource as you write any paper.',
  owl: {
    heading: 'Quoting others',
    source: 'From the Purdue Online Writing Lab (owl.purdue.edu).',
    intro:
      'Using the words of others can be tricky business. You typically only want to use a direct quotation in the following situations:',
    situations: [
      'if you’re using that statement as a piece of evidence for your own argument',
      'if you’re establishing another’s position',
      'if another person has said something better and more clearly than you can.',
    ],
    problem:
      'The main problem with using quotations happens when writers assume that the meaning of the quotation is obvious. Writers who make this mistake believe that their job is done when they’ve chosen a quotation and inserted it into their text. Quotations need to be taken from their original context and integrated fully into their new textual surroundings. Every quotation needs to have your own words appear in the same sentence. Here are some easy to use templates for doing this type of introduction:',
    introducing: {
      label: 'Templates for introducing quotations',
      templates: [
        'X states, “__________.”',
        'As the world-famous scholar X explains it, “__________.”',
        'As claimed by X, “__________.”',
        'In her article __________, X suggests that “__________.”',
        'In X’s perspective, “__________.”',
        'X concurs when she notes, “__________.”',
      ],
    },
    that:
      'You may have noticed that when the word “that” is used, the comma frequently becomes unnecessary. This is because the word “that” integrates the quotation with the main clause of your sentence (instead of creating an independent and dependent clause).',
    explainIntro:
      'Now that you’ve successfully used the quotation in your sentence, it’s time to explain what that quotation means—either in a general sense or in the context of your argument. Here are some templates for explaining quotations:',
    explaining: {
      label: 'Templates for explaining quotations',
      templates: [
        'In other words, X asserts __________.',
        'In making this claim, X argues that __________.',
        'X insists that __________.',
        'What X really means is that __________.',
        'The basis of X’s argument is that __________.',
      ],
    },
  },
  citing: {
    heading: 'Citing your sources',
    intro:
      'Any time you use someone else’s words or ideas in your essay, you are obligated to let your readers know that you’re using someone else’s words or ideas. This is basic courtesy and expected practice. You wouldn’t take a funny story that a friend told you and try to retell it as your own — if you got caught, people would think less of you. It’s the same thing with citing other people’s work — you have to give them a proper shout out. In critical writing, we call shout-outs “citations.”',
    ways: 'You can cite a source when you quote them in several ways:',
    parentheses: {
      label: 'Use parentheses',
      example:
        '“Now, we all know that making learning fun and engaging is a good idea, it’s sort of obvious, but to be blunt, there really isn’t much evidence of it in practice” (Richardson).',
      note: 'Note how the punctuation of the sentence goes after the parentheses when citing parenthetically. The only time you don’t do this is when the final punctuation of the original quote is a question mark or exclamation point, in which case you use the parenthetical citation:',
      questionExample:
        '“Now, education is the most important cornerstone of civilization, isn’t it? Shouldn’t we be making it as engaging and effective as possible?” (Richardson).',
      questionNote:
        'In this case, the question mark is a part of the original quote, and thus is included inside the quotation marks.',
    },
    direct: {
      label: 'Direct introduction',
      example:
        'Richardson states, “Our world and our economy are changing rapidly, and how we approach education needs to adapt.”',
      note: 'In this case, you’ve identified that Richardson is speaking in the introduction of your quote, so you’re covered.',
      thatExample:
        'Richardson states that “our world and our economy are changing rapidly, and how we approach education needs to adapt.”',
      thatNote: 'If you use the word “that” in incorporating your quote, you don’t need a comma to introduce the quote anymore.',
    },
  },
  worksCited: {
    heading: 'Works cited',
    text: 'At the end of your essay, your reader might want to know more about your source, may want to go check it out for themselves, or want to fact check your use of the source. A works cited page accomplishes this purpose. There are great works cited generators all over the internet. For MLA style, search for **“Purdue OWL MLA citation.”**',
    link: 'https://owl.purdue.edu/owl/research_and_citation/mla_style/mla_formatting_and_style_guide/mla_general_format.html',
  },
} as const;

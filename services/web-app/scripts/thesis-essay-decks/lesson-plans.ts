/**
 * The lesson plans that go with the hybrid decks, one per lesson.
 *
 * Brian's lesson plan PDFs (Teacher Training resources) in his words, with
 * each step pointing at the slides it uses, and updated only where the new
 * decks changed: Day 1's sign-up is today's join flow, the house analogy has
 * real slides, Lessons 3 and 6 mention slides his plans skipped. Lesson 7 had
 * no plan; its plan is written from his Lesson 7 training video.
 *
 * Slides are named by title (marks removed), not number, so moving a slide
 * renumbers the plan instead of breaking it. `see` lists slides: a string is
 * one slide, a pair is a range. A title used twice in a deck takes `#2`.
 * `layout:<name>` is every slide of that layout.
 */

export type SlideSpan = string | readonly [string, string];

export interface PlanStep {
  /** Rich text: `**bold**`, `__italic__`. */
  text: string;
  see?: readonly SlideSpan[];
  steps?: readonly PlanStep[];
}

export interface PlanSection {
  heading: string;
  intro?: string;
  steps: readonly PlanStep[];
}

export interface LessonPlan {
  /** The deck it goes with (its file name in `DECKS`). */
  deck: string;
  title: string;
  overview: string;
  studentGoals: readonly string[];
  teacherGoals?: readonly string[];
  materials: readonly string[];
  sections: readonly PlanSection[];
  /** Where the plan comes from, printed small at the end. */
  source: string;
}

const ADAPTED =
  'Adapted from Brian Connell’s lesson plan for the YAWP! Writing Program, with slide numbers for the new deck.';

const LAPTOPS = 'Student laptops/chromebooks and access to yawp.school';

const DAY_ONE: LessonPlan = {
  deck: 'lesson-1-day-1',
  title: 'Lesson Plan Day 1: Introduce Students to YAWP!',
  overview:
    'In this lesson, students will be introduced to the YAWP! assignment and create their YAWP! accounts.',
  studentGoals: [
    'Understand the purpose and philosophy of the YAWP! assignment',
    'Read a sample essay',
    'Create their YAWP! accounts and join your class',
  ],
  teacherGoals: [
    'Explain YAWP!',
    'Facilitate brief discussion on sample essay',
    'Lead students through joining your class on YAWP!',
  ],
  materials: [
    'Slide deck',
    'Sample essay handout (“Bored in the USA”), one per student',
    LAPTOPS,
    'Before class: your class set up in YAWP!, with the Thesis-Driven Essay assigned',
  ],
  sections: [
    {
      heading: 'Instructions',
      steps: [
        {
          text: 'Open with the game **“2 Truths and a Lie.”** This is designed to simply engage students in a fun way at the top of the program.',
          see: [['2 Truths and a Lie', 'Your turn…']],
          steps: [
            {
              text: 'The two reveal slides are Brian’s own. Make your own version, with two photos of yourself and your own two truths and a lie, using his as the model. Or delete them.',
              see: [['I am Brian Connell', 'I am also Brian Connell']],
            },
          ],
        },
        {
          text: '**Define YAWP!**',
          steps: [
            {
              text: 'Using Walt Whitman’s quote, define the term “yawp” for the students.',
              see: [['YAWP!', 'What do you think “yawp” means?']],
            },
            {
              text: 'Using the slides, discuss why we write. This creates shared context and understanding of “What’s the point of this?”',
              see: ['Why do we write?'],
            },
          ],
        },
        {
          text: '**Read Sample Essay.** Hand out the sample essay (“Bored in the USA,” the Sample essay handout in the Modules). Don’t overanalyze or get in the weeds here. Let students connect to it and then help them find the thesis statement.',
          see: [['“Bored in the USA”', 'Class discussion']],
          steps: [
            {
              text: 'Show the Critical Essay Form and what the class is here to do: write a thoughtful, original, critical essay.',
              see: [['The Critical Essay Form', 'What are we doing here?']],
            },
          ],
        },
        {
          text: '**Onboard students to yawp.school.** The website is simply “yawp.school”: there is no “www” or “.com.”',
          steps: [
            {
              text: 'Open your class in YAWP! and go to its **Students** tab. Share the **join link**, or put its QR code up on the board. (The class code shown there is for your reference; it isn’t enough to join.)',
              see: ['Share your class’s join link'],
            },
            {
              text: 'Students open the link on their device, choose a display name, a handle and a password, and click **Join class.** No email needed. The Student Sign-up handout walks them through it.',
              see: ['Create your student account'],
            },
            {
              text: 'Keep a note of handles and passwords, or give the class a pattern to follow, to avoid the inevitable forgotten passwords. You can reset a student’s password from the Students tab.',
            },
            {
              text: 'Once they’re in, have students open the class from their dashboard and start the Thesis-Driven Essay, which creates their document. Next class they open the same document (not a new one) and begin pre-writing.',
              see: ['Your YAWP! dashboard'],
            },
          ],
        },
      ],
    },
  ],
  source: `${ADAPTED} Step 4 is updated for today’s join flow; the old plan’s “Welcome to YAWP!” course and Welcome Exercise are retired.`,
};

const PRE_WRITING: LessonPlan = {
  deck: 'lesson-2-pre-writing',
  title: 'Lesson Plan: Pre-writing',
  overview:
    'In this lesson, students will explore what they’re going to write about and also learn how pre-writing is one of the most important parts of the critical thinking/writing process.',
  studentGoals: [
    'Review the assignment/prompt',
    'Understand what “critical thinking” is',
    'Pre-write on the topic',
    'Narrow their topic by identifying “the diamonds”',
  ],
  teacherGoals: [
    'Introduce Essay Prompt',
    'Break down “critical thinking”',
    'Lead students in Pre-writing activity',
  ],
  materials: ['Slide deck', LAPTOPS],
  sections: [
    {
      heading: 'Instructions',
      steps: [
        {
          text: 'Open with the game **“What’s happening in this picture.”** This is designed to engage students in a shared experience of critical thinking that involves observation and analysis.',
          see: [['Look at this picture.', 'Fallen Man, Paris, France, 1967']],
        },
        {
          text: '**Introduce the essay prompt.** Break the prompt down a little, particularly the guidelines for the type of essay they’re being asked to write (formal, thesis, intro, body paragraphs, conclusion). Optional: Engage students by asking them to share some of their initial ideas.',
          see: ['Your essay prompt', 'Your essay prompt#2'],
        },
        {
          text: 'Let the students know that you’re going to teach them what to do when they get an essay prompt. You might ask them how they feel when they first read a prompt: anxious? overwhelmed? confused? excited? It can definitely feel like a lot to write an essay, but you’re going to show them a practical process for getting started.',
          see: ['So, how do you begin writing a critical essay?'],
        },
        {
          text: 'Use the **Critical Essay Form** slide/handout to point students to the importance of the Thesis Statement (you can’t begin writing an essay without first developing your thesis statement). Tell them that developing that thesis statement takes some time, and it begins with critical thinking: figuring out what we think about a topic.',
          see: [['The Critical Essay Form', 'Thesis statement = the MVP of your essay']],
        },
        {
          text: '**Pre-Writing.**',
          see: [['Pre-Writing', 'The problem, and the fix']],
          steps: [
            {
              text: 'Explain how we often know what we feel about a topic, but we sometimes don’t know why we feel that way.',
              see: ['Critical thinking is simply asking questions and seeking answers about a topic.'],
              steps: [
                {
                  text: 'Brian: “I always use the **‘3 friends walk into a movie’** example, where I ask the kids to imagine we all go see a movie together (I might ask them for a popular movie title to include them). When we come out of the movie, student A (I use an actual student in the class as student A) might say, ‘I loved that movie!’ and I say, ‘Great! Why’d you love it?’ and student A says, ‘Because it was awesome!’ and I say, ‘Why was it awesome?’ and student A says, ‘Because I loved it.’ Student A knows how she feels, but doesn’t know how to explain it: how to answer the question why? She’s failing to offer critical analysis. Conversely, another student might say, ‘I hated it.’ (Why?) ‘Because it sucked.’ (Why?) ‘Because I hated it.’ They know how they feel, but they can’t turn their reaction into analysis. Critical thinking is the key to turning your opinions into smart, scholarly analysis!”',
                },
                {
                  text: '**The 5-year-old:** Have you ever been around a 5-year-old who asks a lot of questions? Every answer earns another question.',
                },
              ],
            },
            {
              text: 'Go over the Pre-Writing slides: read the example about Creed or Disney movies. Explain the process that they’re about to go through in detail.',
              see: [['Pre-write example: the Creed movies', 'Pre-write example 2: Disney movies']],
            },
          ],
        },
        {
          text: '**Writing Activity:** students should log onto yawp.school and open their documents. Make sure that students are on the **Pre-Write** module before they begin pre-writing.',
          see: [['Open YAWP! and start pre-writing', 'Figure out your specific topic']],
          steps: [
            { text: 'Ask students if they have any questions before they begin their own pre-write on the prompt.' },
            {
              text: 'Tell students to begin pre-writing and to follow the instructions that the Tutor gives them. For best results, remind them of the following:',
              see: ['Pre-writing: do and don’t'],
              steps: [
                { text: 'Don’t worry about grammar, syntax, or organization' },
                { text: 'Don’t edit as you go: just get it all out!' },
                {
                  text: 'Pre-writing is like a purging of sorts: it’s about getting your opinions, reactions, and ideas onto the page. Anything goes!',
                },
                { text: 'Ask and answer questions!' },
                { text: 'The more you write at this stage, the better.' },
              ],
            },
            {
              text: 'As students pre-write, work the room. After several minutes, ask individual students if you can quickly read their work. If there are students who aren’t writing, check in with them. Give positive and constructive feedback.',
              see: ['Pre-write'],
            },
            {
              text: 'After students have pre-written for 5 minutes or so, ask them to read over what they’ve written and ask the Tutor for feedback. “It’s always a good idea to read over what you just wrote. Sometimes when we pre-write, we’re just going for it: we’re in a flow state and might not even be fully aware of what we’re saying. When you read over what you wrote, some of it may be messy and not useful at all, but there will be other moments that might stand out as interesting, good, complex, or worthy of more discussion.”',
            },
            {
              text: 'The Tutor will help students identify their **“diamonds in the rough”**: specific subtopics that are coming up in their pre-write. The Tutor will instruct them to choose a “diamond” and pre-write on that. Give them time to continue pre-writing. As they continue this process, their ideas will become more specific and interesting. Eventually, they will find their specific focus for their essays. At this point, the Tutor will conclude the pre-writing process with them.',
              see: ['Find the diamonds'],
            },
          ],
        },
        {
          text: '**Closing Slides: What have we learned today?** Direct students’ attention to the slide and ask individual students to read each point.',
          see: [['What have we learned today?', 'Generating ideas requires energy. Don’t expect it to be easy.']],
        },
      ],
    },
  ],
  source: ADAPTED,
};

const THESIS: LessonPlan = {
  deck: 'lesson-3-thesis-statement',
  title: 'Lesson Plan: How to Write a Thesis Statement',
  overview: 'Students will learn how to write a thesis statement!',
  studentGoals: [
    'See how pre-writing about specific points leads to more complex, sophisticated ideas',
    'Understand what a thesis statement is',
    'Understand how observation and analysis create strong, complex thesis statements',
    'Write their own observation and analysis on their topic',
    'Use their observation and analysis to write a thesis statement',
  ],
  materials: ['Slide deck', LAPTOPS],
  sections: [
    {
      heading: 'Optional Opening: Review',
      steps: [
        {
          text: 'Review assessment questions about critical essays. Ask the class first, then reveal the answer on the next slide.',
          see: [['Quick Review', 'Which of the following is MOST TRUE about a good thesis statement?#2']],
        },
      ],
    },
    {
      heading: 'Opening Activity: Observation and Analysis',
      steps: [
        {
          text: 'Show students the photograph on the board and ask them to observe it/analyze it. Ask, “What’s happening in this picture?” When students offer theories, ask them, “What do you see in the picture that makes you say that?” Stand next to the slide and point out details that the students might be seeing.',
          see: [['What details do you see in this picture?', 'What was going on']],
        },
        {
          text: '(The purpose of this exercise is to teach students the relationship between observation and analysis so that they understand how to use both in their thesis statements.)',
        },
      ],
    },
    {
      heading: 'The Lesson',
      steps: [
        {
          text: 'Depending on where you are as a class, students may need to pre-write more on their specific “diamonds” to get more ideas out. In other cases, students may have already pre-written to the point of finding their specific focus (the goal of pre-writing) and may be ready to get into thesis statements. Use your judgment here: based on what you see on student docs, if they have identified specific areas of focus, then they’re ready to get into thesis statements; if they could benefit from more pre-writing, then give them some time at the start to get more ideas out.',
        },
        {
          text: 'Using the **Critical Essay Form** handout/slide, do a quick review of the importance/role of the thesis statement.',
          see: [['What do we need to figure out before we can write a great essay?', 'Great thesis statements lead to great essays!']],
        },
        {
          text: 'Using the slide deck, talk about how all of the students’ pre-writing up to this point has allowed them to get out ideas and find a focus for their essay. Now, they’re ready to write their thesis statement.',
          see: ['All of your pre-writing…'],
          steps: [
            {
              text: '**Define thesis statement** (keep in mind that many students have never written an essay like this before, so a thesis statement might be a very abstract concept to them. Don’t dwell on this.)',
              see: [['Develop a Thesis Statement', 'Your thesis statement represents the focal point of your essay.']],
            },
            {
              text: 'Go through the slides that define a thesis statement: have students read parts of the slides, if it helps keep them engaged.',
              see: ['Three rules for the sentence'],
            },
            {
              text: 'Go through slides on **“observation”**: feel free to ask students if they can define this word, and see if you can get students participating. Show them the examples of observation statements.',
              see: [['What do we mean by “observation”?', 'Three good observations']],
            },
            {
              text: 'Go through the slides on **analysis**: call on students to read some of these.',
              see: [['So what????', 'Analysis is a reaction, argument, examination, or conclusion based on an observation.']],
            },
            {
              text: 'Very carefully and clearly review the slides on **Observation + Analysis.** Let students see and understand how the analysis is connected to the observation.',
              see: [['Add analysis: example 1', 'Add analysis: example 3']],
            },
            {
              text: 'Then, review the slides on **Combining the Observation and Analysis to Form a Thesis.**',
              see: [['Combine them: example 1', 'Thesis review']],
            },
          ],
        },
        {
          text: '**Writing Activity:**',
          see: [['Your observation and analysis', 'What it looks like']],
          steps: [
            {
              text: 'Students should log onto yawp.school. Make sure they are on the **“Thesis Statement”** module (noted at the top of the Tutor).',
            },
            {
              text: 'If students completed the pre-writing process in the last class, they should have a specific topic at the end of their pre-write. This specific topic will be their starting point today.',
            },
            { text: 'Students should follow the instructions and go through the Thesis process.' },
            {
              text: 'As students begin this process, go around the room and check in with as many students as possible. Help them to identify/compose their observation-analysis.',
            },
            {
              text: 'NOTE: Even for seasoned writers, developing a thesis statement takes time and effort. Help students as much as they need it.',
            },
            {
              text: 'As students draft their thesis statements, they can ask the Tutor for feedback. Note: sometimes the Tutor may make a suggestion around word choice that removes or sterilizes the student’s voice. Be on the lookout for this, and help the students word/shape their thesis statements in effective ways.',
            },
          ],
        },
        {
          text: '**Optional: Avoid the verb “to be.”** The second half of the deck shows how cutting “to be” clears clutter out of a thesis and makes room for stronger verbs. Use it for your own understanding (it helps with revising thesis statements after class), or share it if your students’ writing is ready for it. You can also end the lesson before it.',
          see: [['Avoid the verb “to be”', 'WHOA, DID YOU SEE THAT??????']],
        },
      ],
    },
    {
      heading: 'Following Class',
      steps: [
        {
          text: 'Check each student’s document to ensure that they have a strong, working thesis statement. Give them a positive comment about the work they’ve done.',
        },
        {
          text: 'Revise any thesis statements that are wordy or syntactically incorrect. This kind of intervention is sometimes necessary. It’s best to keep their original and then show them the “Revised Thesis” below so that they can see the differences and understand the improvements made.',
        },
        {
          text: 'The goal here is that at the start of the next class, every student who was present for the Thesis Lesson has a working thesis statement. Unless a student was absent today, you shouldn’t move on to the Introduction Paragraph lesson until all students have their thesis statements.',
        },
      ],
    },
  ],
  source: `${ADAPTED} The review quiz and the optional “to be” section are added; Brian’s plan didn’t mention them.`,
};

const INTRODUCTION: LessonPlan = {
  deck: 'lesson-4-introduction',
  title: 'Lesson Plan: Introduction Paragraph',
  overview:
    'Students will learn how to write an introduction that effectively prepares the reader for their thesis statement.',
  studentGoals: [
    'Review their thesis statements',
    'Understand how an introduction functions',
    'Learn different introduction styles',
    'Begin writing their introductions',
  ],
  materials: ['Slide deck', LAPTOPS],
  sections: [
    {
      heading: 'Optional Opening: Review',
      steps: [
        {
          text: 'Review assessment questions about critical essays. Ask the class first, then reveal the answer on the next slide.',
          see: [['Quick Review', 'Your introduction paragraph’s MAIN function is to:#2']],
        },
      ],
    },
    {
      heading: 'Opening Activity: General to Specific',
      steps: [
        {
          text: 'Using the slides, have students place terms/sentences in order. You can have students work individually or as groups, depending on the class. [Note: the instructions are deliberately vague here. The goal is for students to figure out the order, which is most general to most specific (or vice versa), but don’t tell them this in your directions.]',
          see: ['Place the following 7 terms in order:', 'Place the following sentences in order:'],
        },
        {
          text: 'Have students report on the correct answers, and reveal these on the slides. Ask them how they came to their conclusions. What relationship or order is being used here? (Answer: big-to-small; general-to-specific)',
          see: ['Place the following 7 terms in order:#2', 'Broad to specific, one thread at a time'],
        },
      ],
    },
    {
      heading: 'The Lesson',
      steps: [
        {
          text: 'At this point, most students should have a working thesis statement. **Celebrate this fact:** it’s a major milestone in their essay writing process. It may be useful to check in with students or have them share their thesis statements out loud/with a partner. This helps them understand, own, and commit to their thesis statement, which they’ll be spending a lot of time with.',
          see: ['Now you can begin writing your essay.'],
        },
        {
          text: 'More importantly, now that they have a thesis statement, they can actually begin writing their essays!',
        },
        {
          text: 'Today we will focus on writing an introduction. Using the slides, teach students the **4 types of introduction styles,** with examples.',
          see: [['The Introduction', 'Definition']],
          steps: [
            {
              text: 'Try to engage students in these example intros by considering some of the following:',
              steps: [
                {
                  text: 'Make sure that students understand that they’re going to write their own intros today. Sometimes raising the stakes in this way will encourage them to pay attention to the examples.',
                },
                {
                  text: 'While it may make sense for you to read the first paragraph, you might call on students to read the examples of the different intro styles.',
                },
                { text: 'Comment or ask questions about the different styles.' },
                { text: 'Note in each example intro how the thesis statement is the final sentence of the paragraph.' },
                {
                  text: 'Pay special attention to how these paragraphs start somewhat generally and then become more specific (like the opening activity!) until you’re ready to drop the thesis statement at the end.',
                },
              ],
            },
          ],
        },
        {
          text: '**Writing Activity:** Students write their own introductions.',
          see: [['Write your introduction', 'What it looks like']],
          steps: [
            {
              text: 'Tell students that writing is decision making, and that this is one of those moments where they have to decide how they want to start their essays. With a story? A definition, quote, or question?',
              steps: [
                {
                  text: 'Note: In formal, critical writing students are often told to avoid the first person pronoun “I.” Decide on your policy here: depending on the topics, students may choose to start with a personal anecdote; in this case, it might be ok to use the pronoun “I.”',
                },
              ],
            },
            {
              text: 'Students should hopefully be pretty active in writing their intros. As they do, they’ll surely want immediate feedback from you as well as the YAWP! Tutor: work the room and stay as active as possible with this feedback.',
            },
          ],
        },
      ],
    },
  ],
  source: ADAPTED,
};

const BODY: LessonPlan = {
  deck: 'lesson-5-body-paragraphs',
  title: 'Lesson Plan: Body Paragraphs',
  overview:
    'This class can be a turning point for many students, as they start to see their essays really take shape. Just having a solid introduction that ends with a strong thesis statement can be a big confidence builder for students, as they start to realize that they’re actually writing a great essay. Today’s class is all about getting to this point and then pushing them into the rest of their essay!',
  studentGoals: [
    'Review/improve their intros',
    'Break their thesis statements into parts',
    'Map out and begin writing their body paragraphs',
  ],
  materials: ['Slide deck', LAPTOPS],
  sections: [
    {
      heading: 'Instructions',
      steps: [
        {
          text: '**Prior to class:** hop on student documents to check their progress on their introductions. Give helpful comments and suggestions. Sometimes students may need a transition sentence that links their intro to their thesis. Feel free to help them with this sort of thing. Reviewing intros prior to class will also let you know if you need to give them more time on intros before launching into Body Paragraphs.',
        },
        {
          text: 'Optional: open with the review quiz. Ask the class first, then reveal the answer on the next slide.',
          see: [['Quick Review', 'Which of the following would probably NOT show up in your body paragraphs?#2']],
        },
        {
          text: 'Begin class by asking students to open their YAWP! docs and look at their existing intros/thesis statements.',
          steps: [
            {
              text: 'Refresh their memory about what they did last week (writing intros that prepare the reader to understand their thesis statement). Ask them, “Where does your thesis statement go in your introductory paragraph?” (Answer: the final sentence; feel free to add the disclaimer that this isn’t always the case, and it’s not a hard and fast rule, but for purposes of this essay, that’s where the thesis statement will go.)',
              see: ['The Critical Essay Form'],
            },
            {
              text: 'Optional: Read the Introduction of the Sample Essay together to provide a shared experience/understanding of the Introduction.',
              see: ['Introduction'],
            },
            {
              text: 'Optional: Spend the first part of class checking in on intro paragraphs with students or having them share with a partner. This kind of review helps students spend time with their essays, which connects them to their writing. As you review each student’s intro/thesis, give appropriate praise and feedback to those students who are doing well; ensure that the intro flows nicely into the thesis statement and offer suggestions for linking sentences if this isn’t the case. If students have not yet written an intro, give them clear, direct advice and instructions for how they might begin their essays. Avoid writing their intros for them or getting bogged down with one particular student.',
            },
          ],
        },
      ],
    },
    {
      heading: 'The Lesson',
      steps: [
        {
          text: 'Using the slide deck, tell the students that once they’ve dropped their thesis at the end of their introduction, everything they write must in some way define, illustrate, or support their thesis statement. The good news is that their thesis statement tells them exactly where to go from here.',
          see: [['Supporting Paragraphs', 'Your thesis is a roadmap']],
        },
        {
          text: '**Let Your Thesis be your Guide.**',
          see: [['Haley’s thesis', 'These become your body paragraphs']],
          steps: [
            {
              text: 'Use the example thesis statement to show students how to break their thesis into its parts/elements, noting how these parts become the body paragraphs.',
            },
            {
              text: 'Make sure students are on the **Body Paragraphs** module, and then have them follow the Tutor’s instructions for breaking their thesis statements into their parts. Have students review the suggestion to make sure they agree with how it is broken up. They may want to consult with you on this.',
            },
            {
              text: 'It’s most effective when students highlight the individual parts of their thesis statement in different colors, as the slides do, like this: __When teacher training programs do not emphasize creative design in lesson plans, teachers fail to understand their role as entertainers, resulting in boring lessons.__',
              steps: [
                {
                  text: 'Having this visual will really help students stay organized and focused as they begin their body paragraphs.',
                },
                {
                  text: 'NOTE: Not all thesis statements will have 3 parts: they usually have 2-4 parts (occasionally 5). This is ok! Usually, one part of the thesis will yield one body paragraph, but sometimes a complex idea can yield two (or even three) body paragraphs. Avoid teaching this step like it’s required to have a specific amount of body paragraphs, lest students think we’re teaching the “5-paragraph essay.”',
                },
              ],
            },
          ],
        },
        {
          text: 'Read the **Sample Essay** body paragraphs to reinforce the method and get students in the space of body paragraphs.',
          see: [['Read Sample Essay', 'Body paragraph 3']],
        },
        {
          text: 'Explain the **House Analogy** to students. Walk them through the four stops on the slide: the neighborhood (the introduction), the front door (the thesis statement), the rooms (the body paragraphs), and back at the door (the conclusion).',
          see: ['Your essay is a house, and you’re showing it'],
        },
        {
          text: '**Writing Activity: Write your Body Paragraphs**',
          see: ['What it looks like'],
          steps: [
            {
              text: 'Students should begin writing their first body paragraph that focuses only on the first element of their thesis statement.',
            },
            {
              text: 'Use the **“Basic Structure of a Body Paragraph”** slide to help students.',
              see: ['One paragraph at a time'],
            },
            {
              text: 'Tell students that just as their intro started somewhat generally and got more specific and narrow as it went along, their body paragraphs can also start with the general point/element and then get more specific with examples, analysis, opinions, and conclusions.',
            },
            {
              text: 'You should work the room, reading students’ paragraphs, giving feedback and encouragement. As essays take shape, you might start to see a rise in student confidence: celebrate this!',
            },
          ],
        },
      ],
    },
  ],
  source: `${ADAPTED} The house analogy now has its own slide, ahead of the writing activity.`,
};

const CONCLUSION: LessonPlan = {
  deck: 'lesson-6-conclusion',
  title: 'Lesson Plan: Conclusion Paragraph',
  overview:
    'Students will learn how to write an effective conclusion that goes beyond merely restating their thesis and main ideas.',
  studentGoals: [
    'Understand the function of a conclusion',
    'Learn about rhetorical questions',
    'Write their conclusions',
  ],
  materials: ['Slide deck', LAPTOPS],
  sections: [
    {
      heading: 'Optional Opening: Review',
      steps: [
        {
          text: 'Review assessment questions about critical essays. Ask the class first, then reveal the answer on the next slide.',
          see: [['Quick Review', 'True or False: a good conclusion restates your thesis and main ideas.#2']],
        },
      ],
    },
    {
      heading: 'The Lesson',
      steps: [
        { text: 'At this point, most students should be near or at completion of their body paragraphs.' },
        {
          text: 'If so, make sure that they have advanced their documents to the **“Conclusion Paragraph”** module on yawp.school.',
        },
        {
          text: 'Today we will focus on writing a conclusion. Using the slides, debunk the myth that good conclusions “restate the thesis and main ideas of an essay.” (Note: even if you have been taught this, or taught it yourself, please do accept that it’s a bland and unimaginative way to end an essay.)',
          see: [['Conclusion Paragraph', 'Fact']],
        },
        {
          text: 'Using the slides, discuss the definition of “conclusion” as a deduction that one makes based on available information.',
          see: [['Conclusion (noun)', 'Is your essay about a problem?']],
        },
        {
          text: 'Read the conclusion from the sample essay to show a good alternative to repeating yourself.',
          see: ['How the sample essay’s conclusion begins', 'Haley’s conclusion'],
        },
        {
          text: 'Remind students about the power of the **rhetorical question** and show them the **suggested conclusion structure.**',
          see: [['Begin with a rhetorical question', 'A conclusion that works']],
        },
        {
          text: 'Close with the **house analogy:** the conclusion walks the reader back to the front door, points out the neighborhood, and leaves gracefully, instead of touring every room again.',
          see: ['End the tour gracefully'],
        },
        {
          text: 'NOTE: Some students may still be working on their body paragraphs, which is ok. Let them continue writing their essays wherever they are. Teaching the conclusion paragraph lesson will allow them to finish when they get to this step.',
        },
      ],
    },
    {
      heading: 'Writing Activity: Students write their conclusions.',
      steps: [
        {
          text: 'This part typically goes pretty fast: once students have finished their body paragraphs, they really are in the home stretch, and the suggested structure gives them the path to the finish line.',
          see: ['What it looks like'],
        },
        {
          text: 'As you work the room, pay attention to students’ rhetorical questions. Sometimes they may not fully comprehend how to position themselves with a good, relevant question that provides a springboard for final thoughts. For example, students will ask an overly simple question or simply not know what to say. Help them through these moments.',
        },
      ],
    },
  ],
  source: `${ADAPTED} The house analogy step is added to match the deck.`,
};

const TITLES: LessonPlan = {
  deck: 'lesson-7-titles',
  title: 'Lesson Plan: Titling Your Essay',
  overview:
    'The last day of the program. Students have written their introductions, thesis statements, body paragraphs and conclusions; today they give their essays a title as special and original as the work they’ve put in, add the finishing touches, and celebrate. Brian: “The title is like the cherry on top of the ice cream sundae that is a great essay.”',
  studentGoals: [
    'Review what they’ve learned',
    'Understand what makes a strong title',
    'Write a colon title for their essay',
    'Clean up and format their essays, then submit',
  ],
  teacherGoals: ['Lead the course review', 'Teach the colon title', 'Celebrate students’ work'],
  materials: ['Slide deck', LAPTOPS],
  sections: [
    {
      heading: 'Optional Opening: Course Review',
      steps: [
        {
          text: 'Go through the course review: things students have seen and know. You might even make it a final quiz for an easy grade, to reward them for all of their hard work.',
          see: [['Course Review', 'True or False: a good conclusion restates your thesis and main ideas.#2']],
        },
        {
          text: 'The one some students still get wrong: they cling to the idea that a good conclusion restates the thesis and main ideas. It doesn’t. A good conclusion should be compelling and interesting and offer some final conclusions or deductions on the topic. Show the suggested structure for anyone still working on theirs.',
          see: ['A conclusion that works'],
        },
      ],
    },
    {
      heading: 'The Lesson',
      steps: [
        {
          text: 'We’ve all seen titles like “English Essay” or “My Paper.” Maybe that’s acceptable for students who haven’t spent time on their papers, but our students have invested their time and energy to create something special and original. Their titles should be too.',
          see: ['Titling Your Essay'],
        },
        {
          text: 'A title should be **informative, smart, and memorable**: it indicates the topic of the discussion in a thoughtful way. Teach the **colon title** with the three examples.',
          see: ['The colon title'],
        },
        {
          text: 'Break the titles into their two halves. The **left side** is a creative or fun element; the **right side** is a clear, direct description of what the essay is about. Alone, either side is ordinary at best and confusing at worst: “Beyond the Boys Club” could be about anything. Together, the left side gives flavor to the right and makes it pop.',
          see: ['Two halves, one great title'],
          steps: [
            {
              text: 'All three examples happen to start the right side with “How.” That isn’t required: it just has to describe the essay directly.',
            },
          ],
        },
      ],
    },
    {
      heading: 'Writing Activity',
      steps: [
        {
          text: 'Students draft and revise their titles. The Tutor knows the colon title and gives students the same instructions, so they can use it to draft and revise.',
          see: ['Write your title'],
        },
        {
          text: '**Finishing touches.** Have students put it all together:',
          see: [['Putting it All Together', 'What finished looks like']],
          steps: [
            {
              text: '**Clean up:** delete pre-writing, observation and analysis notes, and headings like “Introduction.” Only the essay stays.',
            },
            { text: '**Title it:** title on the first line, centered and in italics, using the toolbar.' },
            {
              text: '**Keep it simple:** “Be normal with your formatting. This is not the place to be creative.” YAWP! sets the font; paragraphs stay left-aligned (only the title is centered), with an empty line between them. If you have your own formatting standards, use them.',
            },
            {
              text: '**Read it, then Submit:** read it once from the top, ask the Tutor for feedback if they want, then click Submit.',
            },
          ],
        },
      ],
    },
    {
      heading: 'Celebrate',
      steps: [
        {
          text: 'You and your students have been in this together, so feel good about what you’ve done. Ask students for some reflections on the process, or have them highlight their favorite part of their essay and explain why in a comment.',
        },
        {
          text: 'Share the work: within the class, or, once you’ve read and graded it, with other English teachers or administrators. The YAWP! Writing Program can also publish a class’s essays as a printed book for students, parents and administrators.',
        },
      ],
    },
  ],
  source:
    'New. Brian Connell wrote no lesson plan for this lesson; this one is written from his Lesson 7 training video.',
};

export const LESSON_PLANS: readonly LessonPlan[] = [
  DAY_ONE,
  PRE_WRITING,
  THESIS,
  INTRODUCTION,
  BODY,
  CONCLUSION,
  TITLES,
];

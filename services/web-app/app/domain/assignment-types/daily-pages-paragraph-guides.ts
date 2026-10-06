import {
  enabledParagraphModes,
  getParagraphMode,
  type ParagraphModeKey,
} from './daily-pages-paragraph-modes';

/**
 * What a student is aiming for in each Daily Pages paragraph type, explained
 * several ways: the three parts in plain words, the part most often skipped,
 * a model with each part marked, a typical miss with the one change that
 * fixes it, and the questions the tutor will ask.
 *
 * Teachers read it on the Daily Pages page; students open it from inside an
 * assignment of that type. It is one explanation for both, and it names the
 * same three parts, in the same order, as the tutor's coaching (a test holds
 * that), so a student is never taught one model and coached on another.
 *
 * The models answer prompts that are not in the prompt library. The guide is
 * open while a student writes, so its model must never be the answer to an
 * assignment they could be given. Each miss answers the same prompt as its
 * model, so the two can be read side by side.
 */

export type ParagraphGuide = {
  key: ParagraphModeKey;
  label: string;
  /** One line on what this kind of paragraph does. */
  summary: string;
  parts: Array<{ name: string; explanation: string }>;
  oftenSkipped: string;
  model: {
    prompt: string;
    text: string;
    /** Where each part is in the model; excerpts appear in `text` verbatim. */
    marks: Array<{ part: string; excerpt: string }>;
  };
  miss: {
    text: string;
    whatsMissing: string;
    fix: string;
  };
  tutorAsks: string[];
};

const GATSBY_PROMPT =
  'Reread the opening pages of The Great Gatsby. What is Nick refusing to say outright about Gatsby? Quote the words that give it away, and explain what they are doing. One paragraph.';

const PHONES_PROMPT =
  'Should phones be banned during the school day? Take a position, give your strongest reason, and test it against one specific situation where your position might fail. One paragraph.';

const CHEATING_PROMPT =
  'What counts as cheating? Draw the line in a sentence, give one case that is clearly on one side of it, and test it against a case that sits right on the line. One paragraph.';

const ROAD_PROMPT =
  'In the last stanza of "The Road Not Taken," Robert Frost\'s speaker says he "shall be telling this with a sigh / Somewhere ages and ages hence." What does the poem mean by that? Defend your reading from its words. One paragraph.';

const FIELD_TRIP_PROMPT =
  'After a few students broke the rules on last spring\'s trip, the school canceled this year\'s field trip for the whole grade. Judge the decision. Name the standard you judge it by, and measure the decision against it. One paragraph.';

const TEXTING_PROMPT =
  'Source A, a survey of one high school: 68% of students would rather text a friend than call. Source B, the school\'s counselor: "The students who come to me most upset are the ones who found out something big by text." Bring the two sources together into one point neither makes alone. One paragraph.';

const GUIDES: Record<string, Omit<ParagraphGuide, 'key' | 'label'>> = {
  analyze: {
    summary:
      'A point about how a text works, the exact words that show it, and an explanation of how those words do it.',
    parts: [
      {
        name: 'Claim',
        explanation:
          'A point about how the text works: what a word, image or choice is doing. Not a summary of what happens.',
      },
      {
        name: 'Evidence',
        explanation:
          'The exact words that show it: a short quotation or a precise moment. A few words that do the work beat a long passage.',
      },
      {
        name: 'Analysis',
        explanation:
          'How those words prove the claim. Say what a word or image does that another would not. This is where the paragraph is won.',
      },
    ],
    oftenSkipped:
      'Explaining the evidence. Quoting a line and writing "this shows…" is not analysis. The analysis says what the words do, and why that proves your claim.',
    model: {
      prompt: GATSBY_PROMPT,
      text: 'Nick never admits that he envies Gatsby, but his words give him away. He praises Gatsby\'s "extraordinary gift for hope" and "romantic readiness," then blames everything on "what preyed on Gatsby," as if the dream were an animal that hunted him rather than something he chose. That verb lets Nick admire the dream without having to want it. It\'s a way of keeping his distance: the more Nick insists that Gatsby was a victim of his own wonder, the less he has to admit that he wishes he could believe in anything that much himself.',
      marks: [
        {
          part: 'Claim',
          excerpt:
            'Nick never admits that he envies Gatsby, but his words give him away.',
        },
        {
          part: 'Evidence',
          excerpt:
            'He praises Gatsby\'s "extraordinary gift for hope" and "romantic readiness," then blames everything on "what preyed on Gatsby,"',
        },
        {
          part: 'Analysis',
          excerpt:
            'as if the dream were an animal that hunted him rather than something he chose. That verb lets Nick admire the dream without having to want it.',
        },
      ],
    },
    miss: {
      text: 'Nick talks about Gatsby a lot in the opening pages. He says Gatsby had an "extraordinary gift for hope." This shows that Nick admires Gatsby. He also talks about "what preyed on Gatsby." This shows that something bad happened to Gatsby.',
      whatsMissing:
        'Two quotations, each followed by "This shows" and a restatement. "Nick admires Gatsby" is what happens, not a claim about how the words work, and nothing explains what the words do.',
      fix: 'Keep one quotation and explain one word in it: what does "preyed" turn the dream into, and why would Nick choose that word?',
    },
    tutorAsks: [
      'What are you saying about how the text works, not just what happens in it?',
      'Which exact words show that? If you quoted a lot, which few words are doing the work?',
      'What does that word do that another word wouldn\'t?',
    ],
  },
  argue: {
    summary:
      'A side someone could disagree with, the strongest reason for it, and one specific case that tests it.',
    parts: [
      {
        name: 'Position',
        explanation:
          'A side someone could disagree with. If no one would argue with it, it is not a position yet. If it says "both sides", choose one.',
      },
      {
        name: 'Reason',
        explanation:
          'The strongest reason for it, made concrete. One reason developed beats three listed.',
      },
      {
        name: 'Test',
        explanation:
          'One specific case where the position could fail: a situation, an example, a moment in the text. If it only holds once you narrow it, the narrower position is the stronger one.',
      },
    ],
    oftenSkipped:
      'The test. More reasons support a position; they do not test it. Find the one case where your position might fail, and show whether it holds there.',
    model: {
      prompt: PHONES_PROMPT,
      text: 'Phones should be locked away during class, but not for the whole school day. The strongest reason to take them is attention: a phone face-down on a desk still pulls at a student every time it buzzes, so the only phone that stops interrupting a lesson is one that is out of reach. The hard case is lunch, where nobody is being taught and a ban looks like control for its own sake. That case is why the line belongs at the classroom door rather than the school gate. A rule meant to protect attention has no reason to follow students into the cafeteria.',
      marks: [
        {
          part: 'Position',
          excerpt:
            'Phones should be locked away during class, but not for the whole school day.',
        },
        {
          part: 'Reason',
          excerpt:
            'The strongest reason to take them is attention: a phone face-down on a desk still pulls at a student every time it buzzes, so the only phone that stops interrupting a lesson is one that is out of reach.',
        },
        {
          part: 'Test',
          excerpt:
            'The hard case is lunch, where nobody is being taught and a ban looks like control for its own sake. That case is why the line belongs at the classroom door rather than the school gate.',
        },
      ],
    },
    miss: {
      text: 'Phones have good and bad sides. On one hand, phones can distract students during class and make it hard to focus. On the other hand, students need phones for emergencies and to contact their parents. Some people think phones should be banned and some people think they shouldn\'t. It really depends on the school and the situation.',
      whatsMissing:
        'It never takes a side. "It depends" lists both sides without choosing, so there is no position for a reason to support or a case to test.',
      fix: 'Choose a side, and say when it applies. Then give the one reason you would keep if you could keep only one.',
    },
    tutorAsks: [
      'What would you say to someone who disagrees with you?',
      'If you could keep only one reason, which one, and why that one?',
      'Where could your position fail, and does it still hold there?',
    ],
  },
  define: {
    summary:
      'A line drawn around a term, one case that clearly fits it, and a hard case that tests where the line falls.',
    parts: [
      {
        name: 'Boundary',
        explanation:
          'What the term takes in and what it leaves out, in a sentence. Not a dictionary definition: a line that something could fall on the wrong side of.',
      },
      {
        name: 'Example',
        explanation:
          'One specific case that clearly falls inside the line, so the reader can see what the term looks like.',
      },
      {
        name: 'Hard case',
        explanation:
          'A case near the line: one that looks like it belongs and does not, or the other way round. Say which side your boundary puts it on. If it makes the line move, the sharper definition is the stronger one.',
      },
    ],
    oftenSkipped:
      'The hard case. Easy examples illustrate a definition; they do not test it. Find a case near the line, one that almost counts or almost does not, and show where your boundary puts it.',
    model: {
      prompt: CHEATING_PROMPT,
      text: "Cheating is getting credit for work that is supposed to show what you can do, when it shows something else instead. Copying a friend's math homework is the clear case: the homework is meant to show the teacher whether you can solve the problems, and it shows that your friend can. The hard case is a tutor who walks you through every step of an essay. Nothing is copied, and getting help is not usually cheating, but if the essay is supposed to show how you write and the tutor's choices are in every sentence, it is cheating by the same line. That case moves the boundary away from what you hand in and toward what the work is supposed to show.",
      marks: [
        {
          part: 'Boundary',
          excerpt:
            'Cheating is getting credit for work that is supposed to show what you can do, when it shows something else instead.',
        },
        {
          part: 'Example',
          excerpt:
            "Copying a friend's math homework is the clear case: the homework is meant to show the teacher whether you can solve the problems, and it shows that your friend can.",
        },
        {
          part: 'Hard case',
          excerpt:
            "The hard case is a tutor who walks you through every step of an essay. Nothing is copied, and getting help is not usually cheating, but if the essay is supposed to show how you write and the tutor's choices are in every sentence, it is cheating by the same line.",
        },
      ],
    },
    miss: {
      text: "Cheating is when someone breaks the rules to get an advantage. For example, copying someone's homework is cheating. Looking at someone else's test is also cheating. Using your phone during a test is cheating too. Cheating is wrong because it is not fair to the people who did the work themselves.",
      whatsMissing:
        'A dictionary definition and three cases that all fit easily. Nothing tests where the line falls, so the definition never has to say what is not cheating.',
      fix: 'Find one case that is hard to sort, help that might or might not be cheating, and say which side of your line it falls on, and why.',
    },
    tutorAsks: [
      'What does the term take in, and what does it leave out?',
      'What is one specific case that clearly fits?',
      'What case sits near the line, and which side of it does your definition put it on?',
    ],
  },
  interpret: {
    summary:
      'A reading of what a passage means beyond what it says, the words that support it, and a defense of it against the obvious reading.',
    parts: [
      {
        name: 'Reading',
        explanation:
          'What the passage means, not what it says: something a reader comes to understand that the words never state outright. A theme that would fit any book is not yet a reading.',
      },
      {
        name: 'Evidence',
        explanation:
          'The exact words that support the reading: a short quotation or a precise moment. The best evidence only makes sense under your reading.',
      },
      {
        name: 'Defense',
        explanation:
          'Why the words point to your reading and not the obvious one. Name the obvious reading, and show what it cannot explain.',
      },
    ],
    oftenSkipped:
      'The defense. Quoting words that fit your reading is not enough if they fit the obvious reading just as well. Say what the obvious reading is, and why the words point to yours instead.',
    model: {
      prompt: ROAD_PROMPT,
      text: 'The famous last lines are not a celebration of taking the road less traveled; they are a prediction that the speaker will tell the story that way. The poem has already admitted that the two roads were worn "really about the same" and that both "equally lay / In leaves no step had trodden black." So when he says he "shall be telling this with a sigh / Somewhere ages and ages hence," the future tense matters: the difference is something he will claim later, not something he found that morning. The obvious reading takes "that has made all the difference" at its word, but the poem has spent two stanzas taking that difference away. The sigh belongs to someone who knows he is going to tidy up his own life story.',
      marks: [
        {
          part: 'Reading',
          excerpt:
            'The famous last lines are not a celebration of taking the road less traveled; they are a prediction that the speaker will tell the story that way.',
        },
        {
          part: 'Evidence',
          excerpt:
            'The poem has already admitted that the two roads were worn "really about the same" and that both "equally lay / In leaves no step had trodden black."',
        },
        {
          part: 'Defense',
          excerpt:
            'The obvious reading takes "that has made all the difference" at its word, but the poem has spent two stanzas taking that difference away.',
        },
      ],
    },
    miss: {
      text: 'In "The Road Not Taken," the speaker comes to two roads in a wood and has to choose one. He takes the one less traveled by. At the end he says that "that has made all the difference." This means that he is glad he made a different choice than other people. The poem shows that it is important to be yourself and take your own path in life.',
      whatsMissing:
        'It paraphrases the last line and calls that the meaning, then names a theme that would fit many poems. Nothing defends the reading, and the lines that cut against it go unmentioned.',
      fix: 'Find the words that make the obvious reading harder to believe (how different were the two roads, really?) and say what the last stanza means once you have read them.',
    },
    tutorAsks: [
      'What does the passage mean that the words never say outright?',
      'Which exact words only make sense under your reading?',
      'What is the obvious reading, and why do the words point to yours instead?',
    ],
  },
  evaluate: {
    summary:
      'A verdict, the standard it is reached by, and a specific case measured against that standard.',
    parts: [
      {
        name: 'Judgment',
        explanation:
          'Your verdict: right or wrong, worth it or not, earned or unearned. Say which way you come down, and how far.',
      },
      {
        name: 'Standard',
        explanation:
          'What you are judging by. "Bad" by what measure? A choice can be loyal and still unwise, so name the one measure your verdict rests on.',
      },
      {
        name: 'Evidence',
        explanation:
          'The specific decision, moment or result, held up to your standard: show where it meets the measure or falls short. Keep to the one standard you named.',
      },
    ],
    oftenSkipped:
      'The standard. "It was a bad decision" is an opinion until you say what you are measuring it against. Name the measure, then hold the decision up to it.',
    model: {
      prompt: FIELD_TRIP_PROMPT,
      text: "The school was wrong to cancel the trip for the whole grade, because a punishment is fair only when it lands on the people who did the thing it punishes. Measured that way, the decision fails twice. The forty students who followed every rule last spring lose the trip for something they did not do, and the five who broke the rules lose exactly what everyone else loses, so the punishment does not even single them out. The school's best defense is that it cannot run a trip it no longer trusts students on, but that is a reason to add chaperones, not to punish everyone. A decision meant to teach responsibility teaches the opposite when it ignores who was responsible.",
      marks: [
        {
          part: 'Judgment',
          excerpt: 'The school was wrong to cancel the trip for the whole grade,',
        },
        {
          part: 'Standard',
          excerpt:
            'because a punishment is fair only when it lands on the people who did the thing it punishes.',
        },
        {
          part: 'Evidence',
          excerpt:
            'The forty students who followed every rule last spring lose the trip for something they did not do, and the five who broke the rules lose exactly what everyone else loses, so the punishment does not even single them out.',
        },
      ],
    },
    miss: {
      text: "Canceling the field trip was a bad decision. A lot of students were looking forward to it and now they can't go. The trip was supposed to be fun and educational. The school should have thought about how students would feel before deciding. It was really unfair, and most students are upset about it.",
      whatsMissing:
        'A verdict and a lot of feeling, but no standard. "Unfair" by what measure? Without one, the paragraph can show that people are upset, not why the decision fails.',
      fix: 'Name the one standard you are judging by (what makes a punishment fair?) and then show where the decision falls short of it.',
    },
    tutorAsks: [
      'What is your verdict, and how far do you hold it?',
      'What are you judging by? What would have to be true for the opposite verdict?',
      'Which specific decision or result shows how it measures up?',
    ],
  },
  synthesize: {
    summary:
      'One point that two or more sources make together and neither makes alone, what each contributes, and how they connect.',
    parts: [
      {
        name: 'Point',
        explanation:
          'What you see when you put the sources together that neither says alone. If one source already says it, it is a summary, not a synthesis.',
      },
      {
        name: 'Sources',
        explanation:
          'The one specific thing each source contributes: a finding, a detail, a quotation. Not a summary of the whole source.',
      },
      {
        name: 'Connection',
        explanation:
          'How the pieces fit: does one explain, limit, or contradict the other? Say what one source changes about what the other means.',
      },
    ],
    oftenSkipped:
      'The connection. Summarizing one source and then the other is two summaries, not a synthesis. Say what one source changes about the other.',
    model: {
      prompt: TEXTING_PROMPT,
      text: 'Most students would rather text than call, but what makes texting easy to send is what makes hard news hard to receive. The survey shows how strong the preference is: 68% of students would rather text a friend than call. The counselor shows its cost: the students who come to her most upset are "the ones who found out something big by text." Read together, the sources suggest that the preference and the pain come from the same place: a text spares the sender a hard conversation, and leaves the person reading it to have that conversation alone. What feels easier to send can be harder to get.',
      marks: [
        {
          part: 'Point',
          excerpt:
            'Most students would rather text than call, but what makes texting easy to send is what makes hard news hard to receive.',
        },
        {
          part: 'Sources',
          excerpt:
            'The survey shows how strong the preference is: 68% of students would rather text a friend than call. The counselor shows its cost: the students who come to her most upset are "the ones who found out something big by text."',
        },
        {
          part: 'Connection',
          excerpt:
            'Read together, the sources suggest that the preference and the pain come from the same place: a text spares the sender a hard conversation, and leaves the person reading it to have that conversation alone.',
        },
      ],
    },
    miss: {
      text: 'Source A is a survey that found 68% of students would rather text a friend than call. This shows that texting is very popular with students. Source B is a guidance counselor who says the students who are most upset found out something big by text. This shows that texting can be bad. Both sources show that texting is an important part of students\' lives.',
      whatsMissing:
        'One summary, then another, then a point either source makes alone. Nothing connects them, so the reader never learns what the counselor changes about the survey.',
      fix: "Ask what the counselor's students tell you about the 68%, and write the point that only appears when you read the two together.",
    },
    tutorAsks: [
      'What do you see when you put the sources together that neither says alone?',
      'What is the one specific thing each source contributes?',
      'How does one source change what the other means?',
    ],
  },
};

function toGuide(key: ParagraphModeKey): ParagraphGuide | null {
  const mode = getParagraphMode(key);
  const guide = GUIDES[key];
  if (!mode || !guide) return null;
  return { key: mode.key, label: mode.label, ...guide };
}

/** The guide for a switched-on type, or null for anything else. */
export function getParagraphGuide(
  key: string | null | undefined
): ParagraphGuide | null {
  const mode = getParagraphMode(key);
  return mode ? toGuide(mode.key) : null;
}

/** Guides for every switched-on type, in the registry's order. */
export function enabledParagraphGuides(): ParagraphGuide[] {
  return enabledParagraphModes()
    .map((mode) => toGuide(mode.key))
    .filter((guide): guide is ParagraphGuide => guide !== null);
}

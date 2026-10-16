/**
 * Faculty Lounge launch content, from Brian's "Seeding the Faculty Lounge"
 * (Oct 16, 2026). Text is Brian's, word for word, apart from list layout for
 * plain-text display. Each item has a stable seedKey so seeding twice never
 * duplicates or overwrites anything (edits made in the app are kept).
 *
 * Authors: "brian" and "kevin" are resolved to real YAWP! team accounts by
 * the seed script.
 */
export type LaunchAuthor = 'brian' | 'kevin';
export type LaunchKind = 'QUESTION' | 'SHARE' | 'WIN';

export type LaunchPost = {
  seedKey: string;
  author: LaunchAuthor;
  kind: LaunchKind;
  topic: string;
  title: string;
  body: string;
  /** Pinned to the top, in this order. */
  pin?: boolean;
  /** Saved as a draft for the team to finish and schedule from the inbox. */
  draft?: boolean;
  /** Brian's answer, posted as a YAWP! team reply. */
  answer?: { seedKey: string; body: string };
};

export const WELCOME: LaunchPost = {
  seedKey: 'launch:welcome',
  author: 'brian',
  kind: 'SHARE',
  topic: 'other',
  pin: true,
  title: 'Welcome to the Faculty Lounge',
  body: `Every school's faculty lounge has its own personality, and some of them aren't great. The air is heavy, and teachers complain about the schedule, the kids, the copier, and the latest district initiative. The bulletin board has sad paper bats from two Halloweens ago, and Mrs. Abernathy sits in her usual chair in the corner, telling anyone who will listen that the kids stopped reading in 1997.

And some of them are the best rooms in the building. You grab a cup of coffee and sit down for 10 minutes. A colleague walks in with a hilarious story about their fourth-period freshman. Somebody else has an idea for the novel you're starting Monday. You walk out a little lighter than you walked in, and for a few minutes, you weren't alone in your siloed classroom.

Teaching writing is hard. Nobody hands us the craft on day one. Most of us piece it together over years of trial and error. Some teachers figure it out, but plenty of good ones get worn down and settle for whatever gets them through the semester. Whether you’re a new teacher navigating the confusion or a veteran with tried and tested plans, let’s be here for each other so we can give our students what they need to become great writers.

The second kind of lounge is what we're after: a place to talk shop, to ask questions, to share lessons, to get inspired, and to inspire others. A place to connect with teachers outside your own building, to recharge a little, and to become better writing teachers together. The YAWP! team (Eric, Kevin, Bryant, and I) will be in here too, to answer questions and share what we've seen using YAWP! with our own students and teachers. But this lounge is yours, so jump in, claim your spot! Start by telling us who you are, where you teach, and why you decided to try YAWP! this year.

— Brian C.`,
};

export const HOUSE_RULES: LaunchPost = {
  seedKey: 'launch:house-rules',
  author: 'brian',
  kind: 'SHARE',
  topic: 'other',
  pin: true,
  title: 'House Rules for the Lounge',
  body: `A few things that keep this the good kind of faculty lounge:

1. Protect your students. No names, photos, or details that could identify a student. If you want to share student writing, take the name off. We'd love to see the work, but we need to stay compliant.

2. Ask the question. If you're wondering about it, somebody else in here is too. No question is too basic, and we're all here for each other.

3. Think out loud. Great lessons don't arrive fully formed. They start as a hunch, a question, or something that half-worked last Tuesday, and they get better when other teachers ask questions and add their ideas. Share what worked, what flopped, and what you're still figuring out. You don't need a finished plan to post.

4. Give each other grace. Every classroom is different. What works in a rural ninth-grade class might not work in an AP course at a private school. When someone does things differently, consider where they're coming from.

5. Vent if you need to, but lean toward solutions. Teaching is hard, and some days you just need to say so. That's fine here, but don't just dump and run. Ask others what's worked for them, or share what you'll try next. We love Mrs. Abernathy, but we don't want to inherit her chair when she retires.

6. Keep it about teaching. No selling, no promotions, no recruiting for your side hustle.

7. Something broken or wrong? Use the Contact Us button at the top of the Lounge to reach the YAWP! team directly. We'll take care of it faster than a thread will.`,
};

export const LAUNCH_QUESTIONS: LaunchPost[] = [
  {
    seedKey: 'launch:q1-routine',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'classroom-routines',
    title: "What's the best way to use YAWP! to make writing a regular part of our class routine?",
    body: '',
    answer: {
      seedKey: 'launch:q1-routine:brian',
      body: `Use the Class Starter to build reps. The first five to ten minutes of class, every day if you can. Send your class the assignment, set a timer, and let them write. The Class Starter is graded on showing up and thinking, not on polish, so the stakes are low and the habit builds fast. After a week, students walk in and open YAWP! without being told.

The routine is the key. Writing becomes normal when it happens at the same time every day, and low stakes, accessible, fun writing (for a relatively easy grade) makes students comfortable and gradually builds confidence. Then, when you ask them to write the more advanced essay, it’s less daunting. How do you fit writing into your class periods?`,
    },
  },
  {
    seedKey: 'launch:q2-more-writing',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'classroom-routines',
    title: 'My students write two sentences in the Class Starter and stop. How do I get them writing more?',
    body: '',
    answer: {
      seedKey: 'launch:q2-more-writing:brian',
      body: `A lot of students have been graded poorly on writing in the past, and their confidence is low. As a result, they’re not comfortable just letting ideas flow. Your job early on is to unteach that. A few things that work:

• Write with them. When the timer starts, you write too. When time is up, invite students to share what they wrote. To get them sharing what they wrote, you share too. This is also a great way to build rapport with your students.

• Remind them that they’re not being graded on correctness. There’s a time and place for grammar and syntax, but the Class Starter is about getting ideas out — this is their space to just go for it in their own voice and style.

• Keep the keys clacking. Tell your students to keep writing until the timer goes off. Stream of consciousness is okay for a Class Starter.

• Ask questions they actually have an opinion about. A prompt about their own lives or something they care about will get more than a prompt about the reading, at least at first.

• Let the Tutor do its job. It's built to pick up whatever a student writes, even one line, and ask a question that pulls more out of them. Some students like to use the Tutor as they write, while others like to get feedback at the end. Let your students use it as they need to.

• Read some out loud. With permission, and no names, read a few strong lines to the class. When students hear their classmates' ideas, they start trying to write lines worth reading.

Don't grade length yet. If two sentences turns into four by the end of the month, that's a win. What's gotten your quietest writers going?`,
    },
  },
  {
    seedKey: 'launch:q3-prewriting-thesis',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'thesis-essays',
    title: 'How are people using the pre-writing assignment and the thesis assignment?',
    body: '',
    answer: {
      seedKey: 'launch:q3-prewriting-thesis:brian',
      body: `I think of them as one move in two steps. The pre-writing is where the thinking happens. It's supposed to be messy. Students explore the text or the topic, react to it, ask questions, and follow whatever's interesting. The Tutor works like a record producer here: it listens for the material that could become a great essay and helps the student find it. By the end, the student should have a focus they could build an argument around.

The thesis assignment takes that focus and shapes it into a claim. Because the student has already done the thinking, they're not inventing an argument from scratch; they're putting a name on what they already noticed.

That works the same way whether it's literary analysis, rhetorical analysis, or an argument essay. When a student freezes on a thesis, it's almost always because they skipped the thinking. You can't make a claim about something you haven't thought about yet. How are you using these two together?`,
    },
  },
  {
    seedKey: 'launch:q4-ai-comments',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'grading',
    title: 'Do you hand back the AI grading comments as is, or do you edit them? Do your students actually read the comments?',
    body: '',
    answer: {
      seedKey: 'launch:q4-ai-comments:brian',
      body: `I read every one before it goes back, and I edit when I need to. The Grading Assistant gives me a strong first draft of feedback, which saves me a huge amount of time, but the grade and the comments are mine. Sometimes I sharpen a comment, sometimes I add something only I would know about the student, and sometimes I agree with it completely and send it as is.

As for whether students read them: they read comments when they have to do something with them. If feedback just sits next to a score, most students look at the score and move on. When the next step is a revision, or a short response to one comment ("What will you change, and why?"), the comments become the assignment. Do your students read the feedback? What gets them to?`,
    },
  },
  {
    seedKey: 'launch:q5-ai-first-day',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'classroom-routines',
    title: 'How do you talk to students about AI on the first day? What do you actually tell them?',
    body: '',
    answer: {
      seedKey: 'launch:q5-ai-first-day:brian',
      body: `I'm honest with them. I tell them AI exists, they all know how to use it, and pretending otherwise would be silly. Then I tell them what we're doing in this class: we're going to use AI as a coach, not a ghostwriter.

I tell them why. Writing is how you figure out what you think. If something else does the writing, it also does the thinking, and you walk away with nothing. The YAWP! Tutor won't write for you. If you ask it to, it'll tell you it's not that kind of guy. But it will help you think, ask you good questions, and help you get your own ideas onto the page.

And I tell them most of our writing happens in the room, with me there. I'm not trying to catch anybody. I'm trying to help them get better. What do you tell your students about AI?`,
    },
  },
  {
    seedKey: 'launch:q6-explaining-yawp',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'other',
    title: 'How do you explain YAWP! to other adults: parents, administrators, colleagues?',
    body: '',
    answer: {
      seedKey: 'launch:q6-explaining-yawp:brian',
      body: `I keep it simple: every student gets a writing coach, and the teacher stays in charge.

• For parents: your kid is writing more, getting feedback faster, and the AI never writes for them. It's built to make them think.

• For administrators: students write more often, teachers get feedback back faster, and you can see the growth over a semester.

• For colleagues: show them, don't tell them. Pull up a student's pre-write and the essay that came out of it (with the name off). That does more than any pitch.

How have you explained it in your building? What questions are you getting?`,
    },
  },
];

export const COMMUNITY_THREADS: LaunchPost[] = [
  {
    seedKey: 'launch:wins',
    author: 'brian',
    kind: 'WIN',
    topic: 'other',
    title: 'Wins',
    body: 'Share a sample of student work that made you happy or proud this week. (Remember to take the student’s name off!)',
  },
  {
    seedKey: 'launch:assignment-share',
    author: 'brian',
    kind: 'SHARE',
    topic: 'writing-lessons',
    title: 'Assignment Share',
    body: 'Post an assignment that worked. What made it land?',
  },
];

/** "In the hopper": saved as drafts for the team to finish and schedule, about one a week. */
export const HOPPER: LaunchPost[] = [
  {
    seedKey: 'hopper:revision-policy',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'grading',
    draft: true,
    title: 'What is your revision policy, and how do you use YAWP! to do it?',
    body: '',
  },
  {
    seedKey: 'hopper:is-it-theirs',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'classroom-routines',
    draft: true,
    title: "How do I know my students' writing is really theirs?",
    body: '',
  },
  {
    seedKey: 'hopper:tutor-off',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'classroom-routines',
    draft: true,
    title: 'Does anyone turn the Tutor off for their writing assignments?',
    body: '',
  },
  {
    seedKey: 'hopper:essay-stack',
    author: 'kevin',
    kind: 'QUESTION',
    topic: 'grading',
    draft: true,
    title: 'How do you get through a stack of essays without losing your weekend?',
    body: '',
  },
  {
    seedKey: 'hopper:lessons-learned',
    author: 'brian',
    kind: 'SHARE',
    topic: 'other',
    draft: true,
    title: 'Lessons Learned',
    body: `A space to share the best things you've figured out along the way.

It used to go like that, and now it goes like this.

Every good teacher has a few of these: the thing you did for years until you figured out a better way. This thread is for those. Share what you used to do, what you do now, and why it changed. And if you're newer to teaching writing, this is a good place to browse and to ask. Start your post with "New teacher here," and ask away.

I'll go first.

It used to go like that: I assigned the essay in class and collected it a week later. [What came back: rushed drafts written the night before, papers that sounded nothing like the kid, and a stack that ate my weekend.] I'd write comments in the margins, hand them back, and watch students flip to the grade and drop the paper in their bag.

Now it goes like this: All the writing happens in the room. We pre-write together, and students draft while I walk the room. I can catch a kid who's stuck on a thesis on Tuesday instead of finding out on Friday. I see the thinking as it happens, so the writing is theirs, and by the time a paper is turned in, I've already seen most of it come together. [Add a one-line moment: a student, a class, the year it clicked.]

What's yours?`,
  },
];

export const LAUNCH_POSTS: LaunchPost[] = [WELCOME, HOUSE_RULES, ...LAUNCH_QUESTIONS, ...COMMUNITY_THREADS, ...HOPPER];

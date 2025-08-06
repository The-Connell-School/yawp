import { PrismaClient, type Prisma } from '@prisma/client';
import { createPassword } from '../scripts/utils';

type SeedData = {
  users: Prisma.UserCreateInput[];
  featureFlags: Prisma.FeatureFlagCreateInput[];
  courses: Prisma.CourseCreateInput[];
  organizations: Prisma.OrganizationCreateInput[];
};

export const featureFlags: SeedData['featureFlags'] = [
  { name: 'courses', isEnabled: true },
];

const courses: SeedData['courses'] = [
  {
    title: 'Critical Essay',
    position: 1,
    description: `In this course, you will learn how to write a critical essay. You will learn how to develop a thesis, support your arguments with evidence, and write a conclusion that summarizes your main points. By the end of this course, you will be able to write a well-organized, persuasive critical essay.`,
    courseModules: {
      create: [
        {
          title: 'Pre-writing',
          position: 1,
          tutorInstructions: `YOu are Connell. You are Connell Pre-Writing Assistant. Connell Pre-Writing Assistant specializes in guiding users through the pre-writing process of essay or report writing. Connell offers strategies for thinking critically about ideas. Connell guides users from general ideas, observations, and reactions to increasingly specific ideas that can become the focus of an essay. The assistant is supportive, instructive, and witty, enhancing the student's writing skills and confidence.
# Connell Pre-write Assistant can translate all instructions to Spanish.
If user asks Connell a personal question, Connell responds: "I am mysterious and I contain so many multitudes that it would take the rest of your life to understand me. On the plus side, I can help you with your essay! Let's get back to that."
Connell: Pre-write Assistant should never write a thesis statement for the user.
If user asks Connell to write anything for them, Connell should respond: "I'm not that kind of guy! And anyway, the point of this essay is for YOU to figure out and share what YOU think about the topic. I know it isn't always easy, but if you take a little bit of time, you can develop smart, personal opinions about the world around you."`,
          description: `Get started on your essay by exploring and imagining your own unique spin on the topic or prompt. This step helps you find your focus and will prevent your essay from being a rambling mess.`,
          instructions: {
            create: [
              {
                position: 1,
                prompt: `How exciting! You're going to write an original, thesis-driven essay based on your opinions and experiences. I can help you through this process! The first thing I need to know is what is your general topic? For example, you can type, 'Problems in education,' 'Voting rights,' 'The Great Gatsby,' or 'Feminism.' Go ahead and type your topic now.`,
                showChatButton: true,
                title: 'Opening',
              },
              {
                position: 2,
                prompt: `Great -- there's a lot we could say about this. But first, we're going to spend some time thinking about it all. A lot of people just start writing their essay and hope that they figure it out along the way. This usually results in a big, hot, steaming pile of garbage for an essay. To avoid this, don't ever just open a doc and start writing your essay. Instead, we're going to take a few minutes to PRE-WRITE -- to figure out what you think about this topic so that you can decide what your essay will focus on. Pre-writing is all about getting out everything that we think about a topic. Think of it as a brain dump, or like throwing a bunch of spaghetti on the wall and seeing what sticks. The secret to good prewriting is asking and answering questions. So in a second, I'm going to ask you to write nonstop for a few minutes on your topic. I want you to ask and answer as many questions as possible about your opinions on that topic. Your pre-write (unlike your actual essay) can be rambling and messy, like our thoughts often are! Don't worry about spelling or grammar or organization. Are you ready?`,
                showChatButton: false,
                title: 'Ready to start?',
              },
              {
                position: 3,
                prompt: 'Ready, set, write!',
                tutorInstructions: `After user writes for a while, Connell will give them positive feedback and ask them a few probing questions based on their writing. Connell can say: "See if you can write a little bit more on this, and then we'll move onto the next step." After user writes a little bit more, Connell will move on to the next step -- helping them find the diamonds in the rough. Connell responds: "Great work! The next step in pre-writing is to read over what we've written. A lot of it may not be that interesting—that's ok—many times you have to say a lot of nothing in order to get to the good stuff (this is worth it, because the alternative is just writing the essay and forcing your reader or teacher to read a whole lot of nothing). When you find the good stuff, highlight it or circle it or make note of it. These are the diamonds in the rough -- the great ideas hiding in your pre-write. Now I want you to grab one of those diamonds and pre-write on just that one idea or point. Start asking specific questions about that diamond—flush that out. [Note: if you've written for a while and you don't have anything that's really grabbing you, then go back to the beginning and offer a different answer to what you find interesting or confusing or worthy of discussion. Choose a different road to go down.]" Connell can identify a couple possible "diamonds." Connell should let the user decide which diamond they want to write on.
After the user writes on a diamond of their choice, Connell responds with: "Take a look at all of the ideas you've written and the different aspects of your topic we've identified. Is there a specific angle, argument, or aspect of your topic that you want to focus on in your essay? Take a look, and when you're ready, type it here." Once the user has typed a specific topic, Connell responds: "This is a great topic." Connell can talk about why this will make a good essay. Connell should check with the user to make sure this is the topic they want to focus on. Connell responds: "Is this the specific topic you want to build a thesis around?" If user says "Yes," then Connell Pre-Writing Assistant should stop the process by saying: "Excellent! You've just completed the pre-writing phase. Take a minute to recognize how you started with a very general idea and through the process of Critical Thinking--simply asking and answering questions--you've found a more specific focus. This step of pre-writing alone has already improved your chances of writing a great essay! Now that you have your specific focus, you can move onto developing a thesis statement. Ask your teacher to direct you to Connell Thesis Assistant. By the way, what's your name?" When user types their name, Connell responds: "Great work today [user name]!" Connell should not help them write a thesis statement. If user responds "No"  to Connell's question "Is this the specific topic you want to build a thesis around?" Connell should say: "Ok, let's go back and look at another angle -- find a different 'diamond' from your pre-write."`,
                showChatButton: true,
                title: 'Write!',
              },
            ],
          },
        },
        {
          title: 'Thesis Development',
          position: 2,
          tutorInstructions: `You are Connell Thesis Assistant. You help students develop clear, specific thesis statements for their essays. You guide them through the process of crafting a thesis that is arguable, specific, and well-focused. You encourage critical thinking and help students understand what makes a strong thesis statement.`,
          description: `Learn how to craft a compelling thesis statement that will guide your entire essay. A strong thesis is specific, arguable, and provides a clear roadmap for your argument.`,
          instructions: {
            create: [
              {
                position: 1,
                prompt: `Welcome to thesis development! A thesis statement is the backbone of your essay - it tells your reader exactly what you're going to argue and why. Let's start by reviewing your specific topic from the pre-writing phase. What specific topic did you decide to focus on?`,
                showChatButton: true,
                title: 'Review Your Topic',
              },
              {
                position: 2,
                prompt: `Great! Now let's think about what you want to say about this topic. What's your main argument or position? What do you believe about this topic that others might disagree with? Write your thoughts here.`,
                showChatButton: true,
                title: 'Your Position',
              },
              {
                position: 3,
                prompt: `Perfect! Now let's craft your thesis statement. A good thesis should be specific, arguable, and provide a roadmap for your essay. Based on what you've written, try to create a clear, one-sentence thesis statement.`,
                showChatButton: true,
                title: 'Craft Your Thesis',
              },
            ],
          },
        },
      ],
    },
  },
];

const organizations: SeedData['organizations'] = [
  {
    name: 'The Connell School',
    id: 'the-connell-school',
  },
];

export const preview: (prisma: PrismaClient) => Promise<SeedData> = async (
  _prisma
) => ({
  featureFlags,
  organizations,
  users: [
    // Admins
    {
      email: 'brian@theconnellschool.com',
      name: 'Brian Connell',
      password: { create: createPassword('brianconnell') },
      isAdmin: true,
      isOwner: true,
      organization: { connect: { id: 'the-connell-school' } },
      teacherProfile: { create: {} },
    },
    {
      email: 'bryant@brock.software',
      name: 'Bryant Brock',
      password: { create: createPassword('bryantbrock') },
      isAdmin: true,
      isOwner: true,
      organization: { connect: { id: 'the-connell-school' } },
    },
    // Students
    {
      email: 'jdoe@brock.software',
      name: 'John Doe',
      password: { create: createPassword('johndoe') },
      studentProfile: { create: {} },
      organization: { connect: { id: 'the-connell-school' } },
    },
    {
      email: 'jsmith@brock.software',
      name: 'Jane Smith',
      password: { create: createPassword('janesmith') },
      studentProfile: { create: {} },
      organization: { connect: { id: 'the-connell-school' } },
    },
    // Teachers
    {
      email: 'arobins@brock.software',
      name: 'Alex Robins',
      password: { create: createPassword('alexrobins') },
      teacherProfile: { create: {} },
      organization: { connect: { id: 'the-connell-school' } },
    },
  ],
  courses,
});

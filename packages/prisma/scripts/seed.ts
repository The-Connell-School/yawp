/* eslint-disable no-console */
import { PrismaClient, type Prisma } from '../generated/prisma';
import { cleanupDb, createPassword } from './utils';

const prisma = new PrismaClient();

type SeedData = {
  users: Prisma.UserCreateInput[];
  studentCourses: Prisma.StudentCourseCreateInput[];
  teacherCourses: Prisma.TeacherCourseCreateInput[];
  organizations: Prisma.OrganizationCreateInput[];
};

const ORG_ID = 'the-connell-school';
const ORG_NAME = 'The Connell School';
const SCHOOL_COUNT = 3;
const CLASSES_PER_SCHOOL = 6;
const TOTAL_TEACHERS = 8;
const TOTAL_STUDENTS = 50;
const DOCUMENTS_PER_STUDENT = 2;

const organizations: SeedData['organizations'] = [
  {
    name: ORG_NAME,
    id: ORG_ID,
    numOfStudentSeats: TOTAL_STUDENTS + 10,
    numOfTeacherSeats: TOTAL_TEACHERS + 5,
  },
];

const studentCourses: SeedData['studentCourses'] = [
  {
    title: 'Critical Essay',
    position: 1,
    description:
      'In this course, you will learn how to write a critical essay. You will learn how to develop a thesis, support your arguments with evidence, and write a conclusion that summarizes your main points. By the end of this course, you will be able to write a well-organized, persuasive critical essay.',
    studentCourseModules: {
      create: [
        {
          title: 'Pre-writing',
          position: 1,
          tutorInstructions:
            'YOu are Connell. You are Connell Pre-Writing Assistant. Connell Pre-Writing Assistant specializes in guiding users through the pre-writing process of essay or report writing. Connell offers strategies for thinking critically about ideas. Connell guides users from general ideas, observations, and reactions to increasingly specific ideas that can become the focus of an essay. The assistant is supportive, instructive, and witty, enhancing the student\'s writing skills and confidence.\n# Connell Pre-write Assistant can translate all instructions to Spanish.\nIf user asks Connell a personal question, Connell responds: "I am mysterious and I contain so many multitudes that it would take the rest of your life to understand me. On the plus side, I can help you with your essay! Let\'s get back to that."\nConnell: Pre-write Assistant should never write a thesis statement for the user.\nIf user asks Connell to write anything for them, Connell should respond: "I\'m not that kind of guy! And anyway, the point of this essay is for YOU to figure out and share what YOU think about the topic. I know it isn\'t always easy, but if you take a little bit of time, you can develop smart, personal opinions about the world around you."',
          description:
            'Get started on your essay by exploring and imagining your own unique spin on the topic or prompt. This step helps you find your focus and will prevent your essay from being a rambling mess.',
          instructions: {
            create: [
              {
                position: 1,
                prompt:
                  "How exciting! You're going to write an original, thesis-driven essay based on your opinions and experiences. I can help you through this process! The first thing I need to know is what is your general topic? For example, you can type, 'Problems in education,' 'Voting rights,' 'The Great Gatsby,' or 'Feminism.' Go ahead and type your topic now.",
                showChatButton: true,
                title: 'Opening',
              },
              {
                position: 2,
                prompt:
                  "Great -- there's a lot we could say about this. But first, we're going to spend some time thinking about it all. A lot of people just start writing their essay and hope that they figure it out along the way. This usually results in a big, hot, steaming pile of garbage for an essay. To avoid this, don't ever just open a doc and start writing your essay. Instead, we're going to take a few minutes to PRE-WRITE -- to figure out what you think about this topic so that you can decide what your essay will focus on. Pre-writing is all about getting out everything that we think about a topic. Think of it as a brain dump, or like throwing a bunch of spaghetti on the wall and seeing what sticks. The secret to good prewriting is asking and answering questions. So in a second, I'm going to ask you to write nonstop for a few minutes on your topic. I want you to ask and answer as many questions as possible about your opinions on that topic. Your pre-write (unlike your actual essay) can be rambling and messy, like our thoughts often are! Don't worry about spelling or grammar or organization. Are you ready?",
                showChatButton: false,
                title: 'Ready to start?',
              },
              {
                position: 3,
                prompt: 'Ready, set, write!',
                tutorInstructions:
                  'After user writes for a while, Connell will give them positive feedback and ask them a few probing questions based on their writing. Connell can say: "See if you can write a little bit more on this, and then we\'ll move onto the next step." After user writes a little bit more, Connell will move on to the next step -- helping them find the diamonds in the rough. Connell responds: "Great work! The next step in pre-writing is to read over what we\'ve written. A lot of it may not be that interesting—that\'s ok—many times you have to say a lot of nothing in order to get to the good stuff (this is worth it, because the alternative is just writing the essay and forcing your reader or teacher to read a whole lot of nothing). When you find the good stuff, highlight it or circle it or make note of it. These are the diamonds in the rough -- the great ideas hiding in your pre-write. Now I want you to grab one of those diamonds and pre-write on just that one idea or point. Start asking specific questions about that diamond—flush that out. [Note: if you\'ve written for a while and you don\'t have anything that\'s really grabbing you, then go back to the beginning and offer a different answer to what you find interesting or confusing or worthy of discussion. Choose a different road to go down.]" Connell can identify a couple possible "diamonds." Connell should let the user decide which diamond they want to write on.\nAfter the user writes on a diamond of their choice, Connell responds with: "Take a look at all of the ideas you\'ve written and the different aspects of your topic we\'ve identified. Is there a specific angle, argument, or aspect of your topic that you want to focus on in your essay? Take a look, and when you\'re ready, type it here." Once the user has typed a specific topic, Connell responds: "This is a great topic." Connell can talk about why this will make a good essay. Connell should check with the user to make sure this is the topic they want to focus on. Connell responds: "Is this the specific topic you want to build a thesis around?" If user says "Yes," then Connell Pre-Writing Assistant should stop the process by saying: "Excellent! You\'ve just completed the pre-writing phase. Take a minute to recognize how you started with a very general idea and through the process of Critical Thinking--simply asking and answering questions--you\'ve found a more specific focus. This step of pre-writing alone has already improved your chances of writing a great essay! Now that you have your specific focus, you can move onto developing a thesis statement. Ask your teacher to direct you to Connell Thesis Assistant. By the way, what\'s your name?" When user types their name, Connell responds: "Great work today [user name]!" Connell should not help them write a thesis statement. If user responds "No"  to Connell\'s question "Is this the specific topic you want to build a thesis around?" Connell should say: "Ok, let\'s go back and look at another angle -- find a different "diamond" from your pre-write."',
                showChatButton: true,
                title: 'Write!',
              },
            ],
          },
        },
        {
          title: 'Thesis Development',
          position: 2,
          tutorInstructions:
            'You are Connell Thesis Assistant. You help students develop clear, specific thesis statements for their essays. You guide them through the process of crafting a thesis that is arguable, specific, and well-focused. You encourage critical thinking and help students understand what makes a strong thesis statement.',
          description:
            'Learn how to craft a compelling thesis statement that will guide your entire essay. A strong thesis is specific, arguable, and provides a clear roadmap for your argument.',
          instructions: {
            create: [
              {
                position: 1,
                prompt:
                  "Welcome to thesis development! A thesis statement is the backbone of your essay - it tells your reader exactly what you're going to argue and why. Let's start by reviewing your specific topic from the pre-writing phase. What specific topic did you decide to focus on?",
                showChatButton: true,
                title: 'Review Your Topic',
              },
              {
                position: 2,
                prompt:
                  "Great! Now let's think about what you want to say about this topic. What's your main argument or position? What do you believe about this topic that others might disagree with? Write your thoughts here.",
                showChatButton: true,
                title: 'Your Position',
              },
              {
                position: 3,
                prompt:
                  "Perfect! Now let's craft your thesis statement. A good thesis should be specific, arguable, and provide a roadmap for your essay. Based on what you've written, try to create a clear, one-sentence thesis statement.",
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

const teacherCourses: SeedData['teacherCourses'] = [
  {
    title: 'Teaching the Critical Essay',
    position: 1,
    description:
      'Teacher-focused guidance for coaching thesis development, evidence selection, and feedback cycles.',
    teacherCourseModules: {
      create: [
        {
          title: 'Planning & Scaffolding',
          position: 1,
          description:
            'Build a unit arc, set clear checkpoints, and design supports for diverse writers.',
        },
        {
          title: 'Feedback & Revision',
          position: 2,
          description:
            'Use feedback routines that help students revise with purpose and confidence.',
        },
      ],
    },
  },
  {
    title: 'Assessment & Conferencing',
    position: 2,
    description:
      'Practical strategies for conferencing, grading, and helping students own their growth.',
    teacherCourseModules: {
      create: [
        {
          title: 'Conferencing Routines',
          position: 1,
          description:
            'Run quick, high-impact conferences that uncover student thinking.',
        },
        {
          title: 'Assessment Practices',
          position: 2,
          description:
            'Align rubrics, grading, and reflection to reinforce strong writing habits.',
        },
      ],
    },
  },
];

const FIRST_NAMES = [
  'Alex',
  'Bailey',
  'Casey',
  'Drew',
  'Emery',
  'Finley',
  'Gray',
  'Harper',
  'Jamie',
  'Kai',
  'Logan',
  'Morgan',
  'Nico',
  'Oakley',
  'Peyton',
  'Quinn',
  'Riley',
  'Sage',
  'Taylor',
  'Zion',
];

const LAST_NAMES = [
  'Anders',
  'Beck',
  'Carver',
  'Delaney',
  'Ellis',
  'Foster',
  'Garcia',
  'Hughes',
  'Iverson',
  'Jensen',
  'Keller',
  'Larsen',
  'Morris',
  'Nguyen',
  'Olsen',
  'Patel',
  'Reyes',
  'Shaw',
  'Turner',
  'Valdez',
];

const ESSAY_TOPICS = [
  'The ethics of AI in education',
  'Why local history matters',
  'Social media and attention',
  'The future of renewable energy',
  'Stories that change communities',
  'The cost of fast fashion',
  'The power of civic engagement',
  'Why we should read more poetry',
];

const GRADES = ['9', '10', '11', '12'];
const PERIODS = ['1', '2', '3', '4', '5', '6'];

const TEST_USERS = [
  {
    email: 'admin@fake.test',
    name: 'Admin User',
    password: 'admin123',
    isAdmin: true,
    isOwner: true,
    teacherProfile: true,
  },
  {
    email: 'teacher@fake.test',
    name: 'Teacher User',
    password: 'teacher123',
    teacherProfile: true,
  },
  {
    email: 'student@fake.test',
    name: 'Student User',
    password: 'student123',
    studentProfile: true,
  },
];

function makeName(index: number) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last =
    LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

function makeEmail(role: 'teacher' | 'student', index: number) {
  return `${role}${index + 1}@fake.test`;
}

function makeClassCode(
  schoolIndex: number,
  classIndex: number,
  grade: string,
  period: string
) {
  return `S${schoolIndex + 1}C${classIndex + 1}G${grade}P${period}`;
}

function buildUser(options: {
  email: string;
  name: string;
  password: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  studentProfile?: boolean;
  teacherProfile?: boolean;
}): Prisma.UserCreateInput {
  return {
    email: options.email,
    name: options.name,
    isAdmin: options.isAdmin,
    password: { create: createPassword(options.password) },
    profiles: {
      create: [
        {
          organization: { connect: { id: ORG_ID } },
          isOwner: options.isOwner ?? false,
          studentProfile: options.studentProfile ? { create: {} } : undefined,
          teacherProfile: options.teacherProfile ? { create: {} } : undefined,
        },
      ],
    },
  };
}

const bulkTeacherCount = Math.max(0, TOTAL_TEACHERS - 1);
const bulkStudentCount = Math.max(0, TOTAL_STUDENTS - 1);

const users: SeedData['users'] = [
  ...TEST_USERS.map((user) =>
    buildUser({
      email: user.email,
      name: user.name,
      password: user.password,
      isAdmin: user.isAdmin,
      isOwner: user.isOwner,
      studentProfile: user.studentProfile,
      teacherProfile: user.teacherProfile,
    })
  ),
  ...Array.from({ length: bulkTeacherCount }, (_, index) =>
    buildUser({
      email: makeEmail('teacher', index),
      name: `Teacher ${makeName(index)}`,
      password: `teacher${index + 1}`,
      teacherProfile: true,
    })
  ),
  ...Array.from({ length: bulkStudentCount }, (_, index) =>
    buildUser({
      email: makeEmail('student', index),
      name: `Student ${makeName(index + 7)}`,
      password: `student${index + 1}`,
      studentProfile: true,
    })
  ),
];

async function seed() {
  console.log('🌱 Seeding...');
  console.time(`🌱 Database has been seeded`);

  console.time('🧹 Cleaned up the database...');
  try {
    await cleanupDb(prisma);
  } catch (e) {
    console.error(e);
  }
  const data: SeedData = {
    organizations,
    users,
    studentCourses,
    teacherCourses,
  };
  console.timeEnd('🧹 Cleaned up the database...');

  for (const key of Object.keys(data) as Array<keyof SeedData>) {
    console.time(`Created ${key}`);
    await Promise.all(
      data[key].map((item) => {
        switch (key) {
          case 'organizations':
            return prisma.organization.create({
              data: item as Prisma.OrganizationCreateInput,
            });
          case 'users':
            return prisma.user.create({ data: item as Prisma.UserCreateInput });
          case 'studentCourses':
            return prisma.studentCourse.create({
              data: item as Prisma.StudentCourseCreateInput,
            });
          case 'teacherCourses':
            return prisma.teacherCourse.create({
              data: item as Prisma.TeacherCourseCreateInput,
            });
          default:
            throw new Error(`Unknown model: ${key}`);
        }
      })
    );
    console.timeEnd(`Created ${key}`);
  }

  const module = await prisma.studentCourseModule.findFirst({
    where: { deletedAt: null },
    orderBy: { position: 'asc' },
    include: {
      instructions: { orderBy: { position: 'asc' } },
    },
  });

  if (!module) {
    throw new Error('No student course module found.');
  }

  const firstInstruction = module.instructions[0] ?? null;

  const teacherProfiles = await prisma.teacherProfile.findMany({
    include: { profile: { include: { user: true } } },
  });
  const studentProfiles = await prisma.studentProfile.findMany({
    include: { profile: { include: { user: true } } },
  });
  const seededTeacherCourses = await prisma.teacherCourse.findMany({
    orderBy: { position: 'asc' },
  });

  await Promise.all(
    seededTeacherCourses.map((course, courseIndex) => {
      if (teacherProfiles.length === 0) {
        return Promise.resolve(null);
      }
      const primaryTeacher =
        teacherProfiles[courseIndex % teacherProfiles.length];
      const secondaryTeacher =
        teacherProfiles[(courseIndex + 1) % teacherProfiles.length];
      const teacherIds = new Set(
        [primaryTeacher, secondaryTeacher]
          .filter(Boolean)
          .map((teacher) => teacher.id)
      );
      if (teacherIds.size === 0) {
        return Promise.resolve(null);
      }
      return prisma.teacherCourse.update({
        where: { id: course.id },
        data: {
          assignedTeachers: {
            connect: Array.from(teacherIds).map((id) => ({ id })),
          },
        },
      });
    })
  );

  const classCount = SCHOOL_COUNT * CLASSES_PER_SCHOOL;
  const classStudentBuckets: Array<(typeof studentProfiles)[number][]> =
    Array.from({ length: classCount }, () => []);

  studentProfiles.forEach((student, index) => {
    classStudentBuckets[index % classCount].push(student);
  });

  const studentClassMap = new Map<string, string>();

  const schools = await Promise.all(
    Array.from({ length: SCHOOL_COUNT }, (_, schoolIndex) =>
      prisma.school.create({
        data: {
          name: `School ${schoolIndex + 1}`,
          code: `SCH-${schoolIndex + 1}`,
          organization: { connect: { id: ORG_ID } },
          teachers: {
            connect: teacherProfiles
              .filter((_, index) => index % SCHOOL_COUNT === schoolIndex)
              .map((teacher) => ({ id: teacher.id })),
          },
        },
      })
    )
  );

  const classes: Array<{ id: string }> = [];
  for (const [schoolIndex, school] of schools.entries()) {
    for (let classIndex = 0; classIndex < CLASSES_PER_SCHOOL; classIndex += 1) {
      const classGlobalIndex = schoolIndex * CLASSES_PER_SCHOOL + classIndex;
      const grade = GRADES[classGlobalIndex % GRADES.length];
      const period = PERIODS[classGlobalIndex % PERIODS.length];
      const code = makeClassCode(schoolIndex, classIndex, grade, period);
      const classStudents = classStudentBuckets[classGlobalIndex] ?? [];
      const primaryTeacher =
        teacherProfiles[classGlobalIndex % teacherProfiles.length];
      const secondaryTeacher =
        teacherProfiles[(classGlobalIndex + 1) % teacherProfiles.length];
      const teacherIds = new Set(
        [primaryTeacher, secondaryTeacher]
          .filter(Boolean)
          .map((teacher) => teacher.id)
      );
      const teachersToConnect = Array.from(teacherIds).map((id) => ({ id }));

      const klass = await prisma.class.create({
        data: {
          code,
          schoolYear: '2024-2025',
          period,
          grade,
          title: `Grade ${grade} - Period ${period}`,
          school: { connect: { id: school.id } },
          teachers: { connect: teachersToConnect },
          students: {
            connect: classStudents.map((student) => ({ id: student.id })),
          },
        },
      });

      for (const student of classStudents) {
        studentClassMap.set(student.id, klass.id);
        await prisma.studentProfile.update({
          where: { id: student.id },
          data: {
            school: school.name,
            grade,
            period,
            schoolTeacher:
              primaryTeacher?.profile.user.name ??
              primaryTeacher?.profile.user.email ??
              'Teacher',
          },
        });
      }

      classes.push(klass);
    }
  }

  await Promise.all(
    studentProfiles.map((student, studentIndex) => {
      const classId = studentClassMap.get(student.id) ?? classes[0]?.id ?? null;
      const topic = ESSAY_TOPICS[studentIndex % ESSAY_TOPICS.length];
      const baseTitle = `Essay on ${topic}`;
      return Promise.all(
        Array.from({ length: DOCUMENTS_PER_STUDENT }, (_, docIndex) => {
          const text = `Topic: ${topic}\n\nThis is draft ${docIndex + 1} by ${
            student.profile.user.name ?? student.profile.user.email
          }.`;
          const html = `<p><strong>Topic:</strong> ${topic}</p><p>This is draft ${
            docIndex + 1
          } by ${student.profile.user.name ?? student.profile.user.email}.</p>`;
          return prisma.document.create({
            data: {
              title: `${baseTitle} (${docIndex + 1})`,
              text,
              html,
              class: classId ? { connect: { id: classId } } : undefined,
              profile: { connect: { id: student.profileId } },
              snapshots: {
                create: [{ text, html }],
              },
              studentCourseModuleSessions: {
                create: [
                  {
                    title: `${topic} Session ${docIndex + 1}`,
                    instructionsCompleted: docIndex,
                    studentCourseModule: { connect: { id: module.id } },
                    studentProfile: { connect: { id: student.id } },
                    ...(firstInstruction && {
                      messages: {
                        create: [
                          {
                            content: firstInstruction.prompt,
                            agent: 'assistant',
                            instructionId: firstInstruction.id,
                          },
                        ],
                      },
                    }),
                  },
                ],
              },
            },
          });
        })
      );
    })
  );

  console.timeEnd(`🌱 Database has been seeded`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

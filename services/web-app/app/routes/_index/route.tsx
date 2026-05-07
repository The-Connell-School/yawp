import { Link, type MetaFunction } from 'react-router';
import {
  ArrowRight,
  BookOpenText,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

export const meta: MetaFunction = () => [
  { title: 'YAWP! Writing Program | AI-guided writing for schools' },
  {
    name: 'description',
    content:
      'YAWP! helps schools teach writing with a proven curriculum, teacher training, and an AI tutor that guides students without writing for them.',
  },
  {
    property: 'og:title',
    content: 'YAWP! Writing Program | AI-guided writing for schools',
  },
  {
    property: 'og:description',
    content:
      'A classroom writing platform from The Connell School of Writing, built to help students write stronger original essays.',
  },
  { property: 'og:type', content: 'website' },
];

const stats = [
  { value: '3,000+', label: 'students served' },
  { value: '97%', label: 'student satisfaction' },
  { value: '100%', label: 'teacher-reported improvement' },
];

const challenges = [
  {
    title: 'Students over-relying on AI',
    description:
      'Students can ask generic AI tools to write entire essays instead of learning how to think, draft, revise, and argue clearly.',
    icon: Bot,
  },
  {
    title: 'Teachers losing visibility',
    description:
      'Teachers need a way to guide responsible AI use without turning every writing assignment into a policing exercise.',
    icon: ShieldCheck,
  },
  {
    title: 'Not enough time for feedback',
    description:
      'Large classes make it difficult to give each student the timely, specific coaching that actually improves writing.',
    icon: Clock3,
  },
];

const solutionFeatures = [
  {
    title: 'Professional development for teachers',
    description:
      'Embedded training videos and curriculum materials help schools build confident writing teachers, not just assign another software tool.',
    image: '/img/landing/teacher-training-screen.webp',
  },
  {
    title: 'An AI tutor that guides, never writes',
    description:
      "The YAWP! Tutor is trained around the writing process. It asks questions, gives immediate feedback, and keeps the work in the student's hands.",
    image: '/img/landing/tutor-feedback-screen.jpg',
  },
  {
    title: 'A repeatable writing process',
    description:
      'Students learn a thesis-driven process they can use across English, history, science, and college-level academic writing.',
    image: '/img/landing/course-page-screen.jpg',
  },
];

const comparisonRows = [
  ['Writes essays for students', true, false],
  ['Guides students through the writing process', false, true],
  ['Uses a proven writing curriculum', false, true],
  ['Gives immediate feedback without doing the work', false, true],
  ['Protects academic integrity', false, true],
  ['Saves teachers time on feedback', false, true],
] as const;

const books = [
  {
    title: 'Something Better',
    subtitle:
      'Essays about Problems in Our Communities and How We Might Solve Them',
    detail: 'Written by students from Montgomery Public Schools in Alabama.',
    image: '/img/landing/book-something-better.jpg',
  },
  {
    title: 'These Things Matter',
    subtitle: 'A book of essays about what students care about in 2024',
    detail: 'Written by high schoolers in Jefferson County, Alabama.',
    image: '/img/landing/book-these-things-matter.webp',
  },
  {
    title: 'Brightly Burning',
    subtitle: '35 Essays about Problems in Education Today',
    detail: 'Written by Birmingham City High School students.',
    image: '/img/landing/book-brightly-burning.webp',
  },
  {
    title: 'Where We Stand',
    subtitle: 'A book of essays about what students stand for',
    detail: 'Written by 7th graders from i3 Academy in Birmingham, Alabama.',
    image: '/img/landing/book-where-we-stand.jpg',
  },
];

const testimonials = [
  {
    quote: "I've never felt more proud of an essay in my life.",
    name: 'Haley M.',
    role: '11th grader',
  },
  {
    quote:
      'YAWP! is a game-changer. My students and I actually look forward to the writing process now.',
    name: 'Mr. Scott',
    role: 'history teacher',
  },
  {
    quote:
      'The YAWP! Tutor was like my own T.A. It saved me so much time and allowed me to give my students the personal attention they needed.',
    name: 'Mrs. Toyer',
    role: 'English teacher',
  },
  {
    quote:
      'It was nice to get feedback right away from the YAWP! Tutor. I felt like I was learning how to be a better writer as I was writing.',
    name: 'Elijah S.',
    role: '10th grader',
  },
];

const demoUrl = 'https://app.usemotion.com/meet/brian-connell/meeting';
const connellUrl = 'https://www.theconnellschool.com';

const footerGroups = [
  {
    title: 'Program',
    links: [
      { label: 'Teacher training', href: '#teacher-training' },
      { label: 'AI tutor', href: '#ai-tutor' },
      { label: 'Published student work', href: '#student-work' },
    ],
  },
  {
    title: 'Access',
    links: [
      { label: 'Student/Teacher Login', href: '/auth/login' },
      { label: 'Schedule a demo', href: demoUrl },
      { label: 'The Connell School', href: connellUrl },
    ],
  },
];

function PrimaryLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={to}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-3 text-base/6 font-semibold text-white shadow-sm ring-1 ring-emerald-700 transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:text-sm/6"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </a>
  );
}

function SecondaryLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-md px-4 py-3 text-base/6 font-semibold text-neutral-900 ring-1 ring-neutral-950/15 transition hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:text-sm/6"
    >
      {children}
    </Link>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <p className="text-base/7 font-semibold text-emerald-700 sm:text-sm/6">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-3 max-w-[35ch] text-3xl/9 font-semibold tracking-tight text-neutral-950 sm:text-4xl/10">
        {title}
      </h2>
      <p className="mt-5 max-w-[56ch] text-base/7 text-neutral-700">
        {description}
      </p>
    </div>
  );
}

export default function IndexRoute() {
  return (
    <main className="isolate min-h-dvh bg-stone-50 text-neutral-950 antialiased">
      <header className="border-b border-neutral-950/10 bg-stone-50/95">
        <nav
          className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-6 lg:px-8"
          aria-label="Main navigation"
        >
          <a href="/" aria-label="Homepage" className="flex items-center gap-3">
            <img
              src="/img/landing/yawp-logo-circle.jpg"
              alt=""
              className="size-10 rounded-full outline-1 -outline-offset-1 outline-neutral-950/10"
            />
            <span className="text-lg/6 font-semibold tracking-tight">
              YAWP!
            </span>
          </a>
          <div className="flex items-center gap-3">
            <Link
              to="/auth/login"
              className="rounded-md px-3 py-2 text-base/6 font-semibold text-neutral-800 transition hover:bg-white/70 sm:text-sm/6"
            >
              Student/Teacher Login
            </Link>
            <a
              href={demoUrl}
              className="hidden rounded-md px-3 py-2 text-sm/6 font-semibold text-emerald-800 ring-1 ring-emerald-700/25 transition hover:bg-emerald-50 sm:inline-flex"
            >
              Schedule a demo
            </a>
          </div>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 sm:py-18 lg:grid-cols-[11fr_9fr] lg:px-8 lg:py-24">
        <div className="flex flex-col justify-center">
          <p className="flex w-fit items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm/6 font-medium text-amber-900 ring-1 ring-amber-200">
            <Sparkles className="size-4" aria-hidden="true" />
            Built by teachers for real classrooms
          </p>
          <h1 className="mt-6 max-w-[20ch] text-5xl/12 font-semibold tracking-tight text-neutral-950 sm:text-6xl/14">
            Transform your students' writing.
          </h1>
          <p className="mt-6 max-w-[56ch] text-lg/8 text-neutral-700 sm:text-base/7">
            In the age of ChatGPT, students need more than answers. YAWP!
            combines a proven writing curriculum, an AI tutor that does not do
            the work for them, and teacher training that helps schools build
            confident academic writers.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryLink to={demoUrl}>Schedule a demo</PrimaryLink>
            <SecondaryLink to="/auth/login">Log in to YAWP!</SecondaryLink>
          </div>
          <dl className="mt-10 grid max-w-2xl grid-cols-3 gap-4" role="list">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-l border-neutral-950/15 pl-4"
              >
                <dt className="text-base/6 text-neutral-600 sm:text-sm/6">
                  {stat.label}
                </dt>
                <dd className="mt-2 text-3xl/9 font-semibold tabular-nums tracking-tight text-neutral-950">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative">
          <div className="absolute -top-5 right-5 z-10 rounded-md bg-white px-4 py-3 shadow-lg ring-1 ring-neutral-950/10">
            <p className="text-sm/6 font-semibold text-neutral-950">
              Immediate feedback
            </p>
            <p className="text-sm/6 text-neutral-600">
              without writing for students
            </p>
          </div>
          <img
            src="/img/landing/course-page-screen.jpg"
            alt="Students working in a classroom"
            className="aspect-[4/3] w-full rounded-lg object-cover shadow-xl outline-1 -outline-offset-1 outline-neutral-950/10"
          />
        </div>
      </section>

      <section className="border-y border-neutral-950/10 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="The classroom problem"
            title="Schools need better writing tools, not more shortcuts."
            description="Teachers are trying to build careful thinkers in a world where students can generate a passable answer in seconds. YAWP! keeps the focus on learning the process."
          />
          <dl className="mt-10 grid gap-5 md:grid-cols-3" role="list">
            {challenges.map((challenge) => (
              <div
                key={challenge.title}
                className="rounded-lg bg-stone-50 p-6 ring-1 ring-neutral-950/10"
              >
                <dt className="flex items-center gap-3 text-lg/7 font-semibold text-neutral-950 sm:text-base/7">
                  <span className="flex size-10 items-center justify-center rounded-md bg-white text-emerald-700 ring-1 ring-neutral-950/10">
                    <challenge.icon className="size-5" aria-hidden="true" />
                  </span>
                  {challenge.title}
                </dt>
                <dd className="mt-4 text-base/7 text-neutral-700">
                  {challenge.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        id="teacher-training"
        className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <SectionHeading
          eyebrow="The YAWP! solution"
          title="Real teachers, an AI tutor, and stronger original essays."
          description="YAWP! gives teachers a complete writing program and gives students guided practice through the moments where they usually get stuck."
        />
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          {solutionFeatures.map((feature) => (
            <article
              key={feature.title}
              className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-neutral-950/10"
            >
              <img
                src={feature.image}
                alt=""
                className="aspect-[4/3] w-full object-cover outline-1 -outline-offset-1 outline-neutral-950/5"
              />
              <div className="p-6">
                <h3 className="text-xl/7 font-semibold text-neutral-950 sm:text-lg/7">
                  {feature.title}
                </h3>
                <p className="mt-3 text-base/7 text-neutral-700">
                  {feature.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="ai-tutor"
        className="bg-emerald-950 py-16 text-white sm:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[7fr_5fr] lg:px-8">
          <div>
            <p className="text-base/7 font-semibold text-emerald-200 sm:text-sm/6">
              YAWP! vs. generic AI
            </p>
            <h2 className="mt-3 max-w-[35ch] text-3xl/9 font-semibold tracking-tight text-white sm:text-4xl/10">
              The tutor is designed to teach the process, not replace it.
            </h2>
            <p className="mt-5 max-w-[56ch] text-base/7 text-emerald-50/85">
              Students still plan, draft, revise, and defend their own ideas.
              Teachers get a tool that reinforces their instruction instead of
              undermining it.
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 text-neutral-950 ring-1 ring-white/20">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-neutral-950/10 px-3 py-3 text-sm/6 font-semibold text-neutral-600">
              <span>Capability</span>
              <span>ChatGPT</span>
              <span>YAWP!</span>
            </div>
            <div className="divide-y divide-neutral-950/10">
              {comparisonRows.map(([label, chatGpt, yawp]) => (
                <div
                  key={label}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-4"
                >
                  <p className="text-base/7 text-neutral-800 sm:text-sm/6">
                    {label}
                  </p>
                  <span
                    className={
                      chatGpt
                        ? 'flex size-7 items-center justify-center rounded-full bg-amber-100 text-amber-900'
                        : 'flex size-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-400'
                    }
                    aria-label={chatGpt ? 'Yes' : 'No'}
                  >
                    {chatGpt ? <Check className="size-4" /> : 'x'}
                  </span>
                  <span
                    className={
                      yawp
                        ? 'flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-800'
                        : 'flex size-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-400'
                    }
                    aria-label={yawp ? 'Yes' : 'No'}
                  >
                    {yawp ? <Check className="size-4" /> : 'x'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="student-work"
        className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <SectionHeading
          eyebrow="Student work that goes somewhere"
          title="After class, YAWP! helps students become published writers."
          description="The program elevates student voices and gives schools a concrete artifact of the writing growth happening in their classrooms."
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {books.map((book) => (
            <article
              key={book.title}
              className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-neutral-950/10"
            >
              <img
                src={book.image}
                alt=""
                className="aspect-[3/4] w-full rounded-md object-cover outline-1 -outline-offset-1 outline-neutral-950/10"
              />
              <h3 className="mt-5 text-lg/7 font-semibold text-neutral-950">
                {book.title}
              </h3>
              <p className="mt-2 text-base/7 font-medium text-neutral-700 sm:text-sm/6">
                {book.subtitle}
              </p>
              <p className="mt-3 text-base/7 text-neutral-600 sm:text-sm/6">
                {book.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-neutral-950/10 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="What people are saying"
            title="Teachers and students feel the difference."
            description="YAWP! is built around the writing moments that matter: getting unstuck, receiving useful feedback, revising with purpose, and taking pride in the finished work."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {testimonials.map((testimonial) => (
              <figure
                key={`${testimonial.name}-${testimonial.role}`}
                className="rounded-lg bg-stone-50 p-6 ring-1 ring-neutral-950/10"
              >
                <blockquote className="text-lg/8 font-medium text-neutral-950 sm:text-base/7">
                  "{testimonial.quote}"
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 text-base/7 text-neutral-700 sm:text-sm/6">
                  <CheckCircle2
                    className="size-5 text-emerald-700"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-semibold text-neutral-950">
                      {testimonial.name}
                    </span>
                    , {testimonial.role}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[4fr_3fr] lg:px-8">
        <div>
          <p className="text-base/7 font-semibold text-emerald-700 sm:text-sm/6">
            Tired of edtech that collects dust?
          </p>
          <h2 className="mt-3 max-w-[35ch] text-3xl/9 font-semibold tracking-tight text-neutral-950 sm:text-4xl/10">
            YAWP! was made by teachers solving actual writing problems.
          </h2>
          <p className="mt-5 max-w-[56ch] text-base/7 text-neutral-700">
            The result is a program teachers enjoy teaching with, students enjoy
            learning with, and schools can explain clearly to families and IT
            teams: this is an educational writing platform.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryLink to={demoUrl}>Schedule a demo</PrimaryLink>
            <SecondaryLink to="/auth/login">
              Student/Teacher Login
            </SecondaryLink>
          </div>
        </div>
        <dl className="grid gap-4" role="list">
          {[
            {
              icon: GraduationCap,
              title: 'For schools',
              body: 'A full writing program with teacher training and student-facing tools.',
            },
            {
              icon: MessageSquareText,
              title: 'For teachers',
              body: 'Immediate support for feedback, revision, grading, and classroom flow.',
            },
            {
              icon: BookOpenText,
              title: 'For students',
              body: 'Guided practice that helps them write original academic essays.',
            },
            {
              icon: Users,
              title: 'For classrooms',
              body: 'A shared process that works across grade levels and disciplines.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg bg-white p-5 ring-1 ring-neutral-950/10"
            >
              <dt className="flex items-center gap-3 text-lg/7 font-semibold text-neutral-950 sm:text-base/7">
                <item.icon
                  className="size-5 text-emerald-700"
                  aria-hidden="true"
                />
                {item.title}
              </dt>
              <dd className="mt-2 text-base/7 text-neutral-700">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="border-t border-white/10 bg-neutral-950 px-5 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
            <div>
              <a
                href="/"
                aria-label="Homepage"
                className="flex w-fit items-center gap-3"
              >
                <img
                  src="/img/landing/yawp-logo-circle.jpg"
                  alt=""
                  className="size-11 rounded-full ring-1 ring-white/15"
                />
                <span className="text-2xl/7 font-semibold tracking-tight">
                  YAWP!
                </span>
              </a>
              <p className="mt-5 max-w-[46ch] text-base/7 text-white/72">
                AI-guided writing practice, teacher training, and student work
                worth publishing. Built by The Connell School of Writing for
                real classrooms.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href={demoUrl}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-base/6 font-semibold text-neutral-950 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:text-sm/6"
                >
                  Schedule a demo
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
                <Link
                  to="/auth/login"
                  className="inline-flex items-center justify-center rounded-md px-4 py-3 text-base/6 font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:text-sm/6"
                >
                  Student/Teacher Login
                </Link>
              </div>
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              {footerGroups.map((group) => (
                <nav key={group.title} aria-label={group.title}>
                  <h2 className="text-sm/6 font-semibold uppercase tracking-[0.18em] text-emerald-200">
                    {group.title}
                  </h2>
                  <ul className="mt-4 space-y-3">
                    {group.links.map((link) => {
                      const isInternal = link.href.startsWith('/');
                      return (
                        <li key={link.label}>
                          {isInternal ? (
                            <Link
                              to={link.href}
                              className="text-base/7 text-white/72 transition hover:text-white sm:text-sm/6"
                            >
                              {link.label}
                            </Link>
                          ) : (
                            <a
                              href={link.href}
                              className="text-base/7 text-white/72 transition hover:text-white sm:text-sm/6"
                            >
                              {link.label}
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              ))}
            </div>
          </div>

          <div className="mt-12 grid gap-5 border-t border-white/10 pt-6 text-sm/6 text-white/55 sm:grid-cols-[1fr_auto] sm:items-center">
            <p>
              The YAWP! Writing Program is a registered trademark of The Connell
              School of Writing. Licensed to participating schools and
              educational organizations.
            </p>
            <a
              href={connellUrl}
              className="font-medium text-white/72 transition hover:text-white"
            >
              The Connell School of Writing
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [
  { title: 'YAWP! Writing Program | Improve Writing Skills - Get Started' },
  {
    name: 'description',
    content:
      'Discover the YAWP! Writing Program, combining critical writing curriculum, AI-guided tutoring, and teacher training to improve student writing skills and academic integrity.',
  },
  {
    property: 'og:title',
    content: 'YAWP! Writing Program | Improve Writing Skills - Get Started',
  },
  {
    property: 'og:description',
    content:
      'Discover the YAWP! Writing Program, combining critical writing curriculum, AI-guided tutoring, and teacher training to improve student writing skills and academic integrity.',
  },
  { property: 'og:type', content: 'website' },
];

const demoUrl = 'https://app.usemotion.com/meet/brian-connell/ryxkqvr';
const loginUrl = '/auth/login';
const accessibilityUrl = '/accessibility';
const contactUrl =
  'mailto:yawp@theconnellschool.com?subject=YAWP!%20Writing%20Program';
const connellUrl = 'https://www.theconnellschool.com/';
const itemNumber = '[Item #: AP1030]';

const stats = [
  ['3000+', 'Students served'],
  ['97%', 'Student Satisfaction'],
  ['100%', 'Teacher-Reported Improvement'],
];

const challenges = [
  {
    title: 'Students Over-Relying on ChatGPT',
    body: 'Students are using AI to generate entire essays rather than developing their own critical thinking and writing skills.',
    image: '/img/landing/ai-use-icon.webp',
  },
  {
    title: 'Loss of Control Over AI Use',
    body: 'Teachers struggle to monitor and control how students are using AI tools, making it difficult to maintain academic integrity.',
    image: '/img/landing/frustration-icon.webp',
  },
  {
    title: 'No Time for Meaningful Feedback',
    body: "With large class sizes and heavy workloads, teachers simply don't have the time to give every student the detailed feedback they need.",
    image: '/img/landing/clock-icon.webp',
  },
];

const solutionBlocks = [
  {
    title: 'Professional Development',
    body: 'Our full curriculum, plus embedded training videos, provides everything teachers need to confidently teach the writing process. Develop master writing teachers in your school.',
    image: '/img/landing/teacher-training-screen.webp',
  },
  {
    title: 'AI that Guides, Never Writes',
    body: 'Unlike other AI, the YAWP! Tutor is trained in our curriculum to deliver immediate, personalized feedback that reinforces the teacher’s lessons and guides students through the writing process, saving teachers and students a ton of time while maintaining academic integrity.',
    image: '/img/landing/tutor-feedback-screen.jpg',
  },
  {
    title: 'A Process that Students can use across Academic Disciplines',
    body: 'Students learn a critical thinking and writing process to write original, thesis-driven essays that can stand up in any high school or college classroom.',
    image: '/img/landing/course-page-screen.jpg',
  },
];

const comparisonRows = [
  ['Writes essays for students', true, false],
  ['Guides students through the writing process', false, true],
  ['Trained in proven writing curriculum', false, true],
  ['Provides immediate feedback without doing the work', false, true],
  ['Maintains academic integrity', false, true],
  ['Saves teachers time on feedback', false, true],
] as const;

const books = [
  {
    title:
      'Something Better: Essays about Problems in Our Communities and How We Might Solve Them',
    body: 'Written by students from Montgomery Public Schools in Alabama',
    image: '/img/landing/book-something-better.jpg',
  },
  {
    title: 'These Things Matter',
    body: 'A book of essays about what students care about in 2024, written by high schoolers in Jefferson County, Alabama',
    image: '/img/landing/book-these-things-matter.webp',
  },
  {
    title: 'Brightly Burning: 35 Essays about Problems in Education Today',
    body: 'Written by Birmingham City High School students',
    image: '/img/landing/book-brightly-burning.webp',
  },
  {
    title: 'Where We Stand',
    body: 'A book of essays about what students stand for, written by 7th graders from i3 Academy in Birmingham, Alabama',
    image: '/img/landing/book-where-we-stand.jpg',
  },
];

const testimonials = [
  ['"I\'ve never felt more proud of an essay in my life."', 'Haley M., 11th grader'],
  [
    '"YAWP! is a game-changer. My students and I actually look forward to the writing process now."',
    'Mr. Scott, History Teacher',
  ],
  [
    '"The YAWP! Tutor was like my own T.A.—it saved me so much time and allowed me to give my students the personal attention they needed."',
    'Mrs. Toyer, English Teacher',
  ],
  [
    '"It was nice to get feedback right away from the YAWP! Tutor. I felt like I was learning how to be a better writer as I was writing."',
    'Elijah S., 10th grader',
  ],
];

function Header() {
  return (
    <header className="yawp-site-header">
      <a
        className="yawp-header-login"
        href={loginUrl}
        target="_blank"
        rel="noreferrer"
      >
        Student/Teacher Login
      </a>
      <a className="yawp-logo-link" href="/" aria-label="YAWP! Writing Program">
        <img
          src="/img/landing/yawp-logo-circle.jpg"
          alt="YAWP! Writing Program"
        />
      </a>
      <a
        className="yawp-header-demo"
        href={demoUrl}
        target="_blank"
        rel="noreferrer"
      >
        Schedule a Demo
      </a>
      <details className="yawp-mobile-menu">
        <summary aria-label="Open Menu">
          <span />
          <span />
        </summary>
        <nav>
          <a href={loginUrl} target="_blank" rel="noreferrer">
            Student/Teacher Login
          </a>
          <a href={demoUrl} target="_blank" rel="noreferrer">
            Schedule a Demo
          </a>
        </nav>
      </details>
    </header>
  );
}

function ButtonRow() {
  return (
    <div className="yawp-button-row">
      <a className="yawp-button yawp-button-primary" href={demoUrl}>
        Schedule a Demo
      </a>
      <a className="yawp-button yawp-button-secondary" href="#learn-more">
        Learn more
      </a>
    </div>
  );
}

export default function IndexRoute() {
  return (
    <main className="yawp-public">
      <Header />

      <section className="yawp-hero">
        <div className="yawp-hero-copy">
          <h1>Transform Your Students’ Writing</h1>
          <h3>
            In the age of ChatGPT, students need more than answers—they need
            genuine learning. YAWP! combines proven curriculum, an AI tutor
            (that doesn&apos;t do the work for them), and teacher training to
            develop confident students who can write effectively in academic
            settings.
          </h3>
          <ButtonRow />
          <dl className="yawp-stats">
            {stats.map(([value, label]) => (
              <div key={label}>
                <dt>{value}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="learn-more" className="yawp-section yawp-white-section">
        <div className="yawp-section-inner">
          <h2>The Writing Challenges Schools Face Today</h2>
          <p className="yawp-section-intro">
            We understand the pressures on teachers and the temptations students
            face in the age of AI.
          </p>
          <div className="yawp-challenge-grid">
            {challenges.map((challenge) => (
              <article className="yawp-challenge-card" key={challenge.title}>
                <img src={challenge.image} alt="" />
                <h3>{challenge.title}</h3>
                <p>{challenge.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="yawp-section yawp-beige-section">
        <div className="yawp-section-inner yawp-solution-inner">
          <h2>The YAWP! Solution: Real Teachers, an AI Tutor, Amazing Essays</h2>
          <div className="yawp-solution-stack">
            {solutionBlocks.map((block, index) => (
              <article
                className="yawp-solution-block"
                data-flip={index % 2 === 1 ? 'true' : undefined}
                key={block.title}
              >
                <div className="yawp-solution-text">
                  <h3>{block.title}</h3>
                  <p>{block.body}</p>
                </div>
                <img src={block.image} alt="" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="yawp-section yawp-white-section">
        <div className="yawp-section-inner yawp-comparison-inner">
          <h3>YAWP! vs. ChatGPT: What’s the Difference?</h3>
          <table className="yawp-comparison-table">
            <thead>
              <tr>
                <th />
                <th>ChatGPT</th>
                <th>YAWP! Tutor</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(([label, chatGpt, yawp]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>
                    <span className={chatGpt ? 'yes' : 'no'}>
                      {chatGpt ? '✓' : '✗'}
                    </span>
                  </td>
                  <td>
                    <span className={yawp ? 'yes' : 'no'}>
                      {yawp ? '✓' : '✗'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="yawp-section yawp-beige-section">
        <div className="yawp-section-inner">
          <p className="yawp-books-intro">
            Following classes, let YAWP! turn your students into published
            writers. Our books elevate student voices and demonstrate the great
            work happening in your school.
          </p>
          <div className="yawp-book-grid">
            {books.map((book) => (
              <article className="yawp-book-card" key={book.title}>
                <img src={book.image} alt="" />
                <h2>{book.title}</h2>
                <p>{book.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="yawp-section yawp-white-section yawp-testimonials">
        <div className="yawp-section-inner">
          <h3>What People are Saying</h3>
          <div className="yawp-testimonial-grid">
            {testimonials.map(([quote, author]) => (
              <figure key={author}>
                <blockquote>
                  <em>{quote}</em>
                </blockquote>
                <figcaption>— {author}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="yawp-section yawp-beige-section yawp-final-cta">
        <div className="yawp-section-inner">
          <h3>Tired of EdTech that collects dust?</h3>
          <p>
            YAWP! wasn’t created in Silicon Valley—it was made by teachers
            solving actual problems. The result? Teachers love teaching with it.
            Students love learning with it. Schools see measurable results.
          </p>
          <p>Schedule a demo and see why more schools are choosing YAWP!</p>
          <a className="yawp-button yawp-button-primary" href={demoUrl}>
            Schedule a Demo
          </a>
        </div>
      </section>

      <footer className="yawp-footer">
        <p>
          <a href={contactUrl}>Contact</a>
          <a href="/accessibility">Accessibility</a>
          <a href={connellUrl} target="_blank" rel="noreferrer">
            The Connell School of Writing
          </a>
        </p>
        <pre>
          <code>
            The YAWP! Writing Program® is a registered trademark of The Connell
            School of Writing and is licensed to participating schools and
            educational organizations. All rights reserved.
          </code>
        </pre>
        <p
          className="yawp-footer-item yawp-footer-meta"
          aria-label="Site footer details"
        >
          <span>{itemNumber}</span>
          <span className="yawp-footer-divider" aria-hidden="true" />
          <a className="yawp-footer-meta-link" href={accessibilityUrl}>
            Accessibility
          </a>
        </p>
      </footer>
    </main>
  );
}

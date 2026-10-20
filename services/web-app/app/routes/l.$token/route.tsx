/**
 * A lesson someone shared (stack page redesign: Post to your class, Send
 * this lesson). No login: the link is the key, and it opens only what the
 * teacher chose. A sub's special instructions come first, before anything.
 */
import { useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { Printer } from 'lucide-react';
import { MarkdownContent } from '~/components/ai-chat/assistant-markdown';
import { loadSharedLesson } from '~/domain/lesson-planner/load-shared-lesson.server';
import { HEADING_FONT, STACK_FONTS_HREF, STACK_THEME } from '../app.lesson-planner_.$conversationId.packet/v3/theme';

export const meta: MetaFunction = () => [
  { title: 'A lesson on YAWP!' },
  // A shared lesson is for the people it was sent to, not for search.
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const lesson = await loadSharedLesson(params.token ?? '');
  if (!lesson) throw new Response('This link has expired or was turned off.', { status: 404 });
  return lesson;
}

const AUDIENCE_LINE: Record<string, string> = {
  student: 'From your teacher',
  sub: 'Your sub plan',
  family: 'From your student’s teacher',
  admin: 'Lesson plan',
};

export default function SharedLessonRoute() {
  const lesson = useLoaderData<typeof loader>();
  return (
    <div data-testid="shared-lesson" className="min-h-screen" style={STACK_THEME}>
      <link rel="stylesheet" href={STACK_FONTS_HREF} />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sv-primary)]">
          {AUDIENCE_LINE[lesson.audience]}
        </p>
        <h1 className="text-3xl font-extrabold leading-tight" style={HEADING_FONT}>
          {lesson.title}
        </h1>
        {lesson.className ? <p className="mt-1 text-sm text-[var(--sv-muted)]">{lesson.className}</p> : null}

        {lesson.note ? (
          <section data-testid="shared-note" className="mt-6 rounded-xl border border-[#F3E3C8] bg-[#FBF3E6] p-4 text-sm">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#6B4A12]">
              {lesson.audience === 'sub' ? 'Special instructions' : 'A note from the teacher'}
            </p>
            <p className="whitespace-pre-wrap">{lesson.note}</p>
          </section>
        ) : null}

        {lesson.body ? (
          <section data-testid="shared-body" className="mt-6 rounded-2xl border border-[var(--sv-line)] bg-[var(--sv-card)] p-5">
            <MarkdownContent content={lesson.body} />
          </section>
        ) : null}

        {lesson.writing ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--sv-writing)' }}>
            {lesson.writing.percent}% of class is writing · {lesson.writing.minutes} min
          </p>
        ) : null}

        {lesson.prompts.length ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold" style={HEADING_FONT}>
              The writing prompt
            </h2>
            {lesson.prompts.map((prompt) => (
              <blockquote
                key={prompt.id}
                data-testid="shared-prompt"
                className="mt-3 rounded-xl border-l-4 px-4 py-3 text-sm"
                style={{ borderColor: 'var(--sv-writing)', backgroundColor: 'var(--sv-writing-strip)' }}
              >
                {prompt.content}
              </blockquote>
            ))}
          </section>
        ) : null}

        {lesson.deck ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold" style={HEADING_FONT}>
              Slides
            </h2>
            <ol className="mt-3 grid gap-3 sm:grid-cols-2">
              {lesson.deck.slides.map((slide, index) => (
                <li key={index} data-testid="shared-slide" className="rounded-xl border border-[var(--sv-line)] bg-[var(--sv-card)] p-4 text-sm">
                  <p className="text-xs text-[var(--sv-muted)]">Slide {index + 1}</p>
                  <p className="font-semibold">{slide.title}</p>
                  {slide.body ? <p className="mt-1">{slide.body}</p> : null}
                  {slide.bullets?.length ? (
                    <ul className="mt-1 list-disc pl-5">
                      {slide.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                  {lesson.withNotes && slide.speakerNotes ? (
                    <p className="mt-2 border-t border-[var(--sv-line)] pt-2 text-xs text-[var(--sv-muted)]">
                      Say: {slide.speakerNotes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {lesson.handouts.length ? (
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold" style={HEADING_FONT}>
                Handouts
              </h2>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--sv-line)] bg-[var(--sv-card)] px-3 py-1.5 text-sm font-semibold print:hidden"
              >
                <Printer size={14} /> Print
              </button>
            </div>
            {lesson.handouts.map((handout, index) => (
              <article
                key={handout.id}
                data-testid="shared-handout"
                className="mt-3 break-before-page rounded-xl border border-[var(--sv-line)] bg-[var(--sv-card)] p-5"
              >
                <h3 className="mb-2 font-semibold">
                  {index + 1}. {handout.title}
                </h3>
                <MarkdownContent content={handout.content} />
                {Array.from({ length: handout.lines }, (_, line) => (
                  <div key={line} className="h-7 border-b border-[#C9C2B8]" aria-hidden />
                ))}
              </article>
            ))}
          </section>
        ) : null}

        <p className="mt-12 text-center text-xs text-[var(--sv-muted)]">Made with the YAWP! Lesson Planner</p>
      </main>
    </div>
  );
}

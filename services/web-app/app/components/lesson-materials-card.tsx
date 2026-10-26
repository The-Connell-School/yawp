import { CirclePlay, FileText, Paperclip, Presentation } from 'lucide-react';
import { Link } from 'react-router';

import type { LessonMaterials } from '~/domain/assignment-types/lesson-materials.server';
import type { LessonMaterialKind } from '~/domain/assignment-types/lesson-materials';

const ICONS: Record<LessonMaterialKind, typeof FileText> = {
  'lesson-plan': FileText,
  'slide-deck': Presentation,
  video: CirclePlay,
  handout: Paperclip,
};

/**
 * The course lesson behind a writing step, and what comes with it: the plan
 * and deck to download, and the tutorial video to watch first. Files download
 * straight from the Teacher's Lounge; the video opens its lesson there.
 */
export function LessonMaterialsCard({
  lesson,
  className,
}: {
  lesson: LessonMaterials;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="lesson-materials-heading"
      data-testid="lesson-materials"
      className={
        className ?? 'mb-6 rounded-xl border bg-background p-5 shadow-sm'
      }
    >
      <h2 id="lesson-materials-heading" className="text-[15px] font-semibold">
        Teach the lesson
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {lesson.lessonTitle}, from {lesson.courseTitle} course
      </p>
      <ul className="mt-3 flex flex-col divide-y">
        {lesson.materials.map((material) => {
          const Icon = ICONS[material.kind];
          const content = (
            <>
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              {material.label}
            </>
          );
          const linkClass =
            'inline-flex items-center gap-2 py-2 text-sm text-foreground hover:text-primary hover:underline underline-offset-4';
          return (
            <li key={material.href + material.label}>
              {material.kind === 'video' ? (
                <Link to={material.href} className={linkClass}>
                  {content}
                </Link>
              ) : (
                <a href={material.href} download className={linkClass}>
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * A piece of Yawp material, handed over rather than described.
 *
 * "Use the Body Paragraphs Slide Deck from the Teacher's Lounge (Lesson 5)"
 * asks a teacher to go and look for something. This is the thing itself, with
 * a button that opens it and a line saying what to do with it in this lesson.
 */
import {
  ExternalLink,
  FileText,
  GraduationCap,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import type {
  LessonResource,
  ResourceKind,
} from '~/domain/lesson-planner/lesson-resource';

const ICONS: Record<ResourceKind, LucideIcon> = {
  slides: Presentation,
  document: FileText,
  lesson: GraduationCap,
  link: ExternalLink,
};

const VERBS: Record<ResourceKind, string> = {
  slides: 'Open the deck',
  document: 'Open it',
  lesson: 'Open the lesson',
  link: 'Open the link',
};

export function LessonResourceCard({ resource }: { resource: LessonResource }) {
  const Icon = ICONS[resource.kind];

  return (
    <div
      data-testid="lesson-resource-card"
      className="mt-3 overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Icon size={15} className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {resource.title}
        </span>
        {/* A new tab, because a teacher opening material mid-plan is looking
            something up rather than leaving. */}
        <Button asChild size="sm" variant="outline-primary" className="shrink-0" data-testid="lesson-resource-open">
          <a href={resource.href} target="_blank" rel="noopener noreferrer">
            {VERBS[resource.kind]}
          </a>
        </Button>
      </div>
      {resource.note ? (
        <p className="border-t px-4 py-2.5 text-sm text-muted-foreground">
          {resource.note}
        </p>
      ) : null}
    </div>
  );
}

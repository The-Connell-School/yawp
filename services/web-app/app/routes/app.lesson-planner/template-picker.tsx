/**
 * "Build from my templates" (stack page redesign): the teacher's saved lesson
 * shapes, each with its length, a small time bar with the writing line, and
 * how much of it is writing. Picking one starts a lesson in that shape.
 */
import { X } from 'lucide-react';
import {
  frameworkShape,
  templateShape,
  templateTiming,
  type LessonTemplate,
} from '~/domain/lesson-planner/lesson-templates';
import { STEP_TYPE_COLORS, WRITING_COLOR } from '~/domain/lesson-planner/step-types';
import { cn } from '~/utils/misc';

export function TemplateList({
  templates,
  selectedId,
  onPick,
}: {
  templates: LessonTemplate[];
  selectedId: string | null;
  onPick: (template: LessonTemplate) => void;
}) {
  if (!templates.length) {
    return (
      <p data-testid="no-templates" className="w-full rounded-xl border border-dashed p-4 text-left text-sm text-muted-foreground">
        No templates yet. Set a lesson on its stack page, then “Save this shape as a template”.
      </p>
    );
  }
  return (
    <div className="w-full text-left">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your templates</p>
      <ul className="flex flex-col gap-2">
        {templates.map((template) => {
          const timing = templateTiming(template);
          const span = Math.max(timing.total, template.periodMinutes ?? 0, 1);
          return (
            <li key={template.id}>
              <button
                type="button"
                data-testid="template-row"
                onClick={() => onPick(template)}
                className={cn(
                  'flex w-full flex-wrap items-center gap-4 rounded-xl border bg-background px-4 py-3 text-left transition hover:border-primary/40',
                  selectedId === template.id && 'border-primary'
                )}
              >
                <span className="min-w-[12rem] flex-1">
                  <span className="block text-sm font-semibold">{template.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {template.days?.length ? (
                      // A week's framework reads as its days (Brian's run 5).
                      <span data-testid="template-framework">
                        {template.days.length}-day framework · {frameworkShape(template.days)}
                      </span>
                    ) : (
                      <>
                        {templateShape(template.slots)} · {timing.total} min
                      </>
                    )}
                  </span>
                </span>
                <span className="w-56 max-w-full" aria-hidden>
                  <span className="flex h-2 overflow-hidden rounded-full">
                    {timing.blocks.map((block) => (
                      <span
                        key={block.id}
                        style={{ flexBasis: `${(block.minutes / span) * 100}%`, backgroundColor: STEP_TYPE_COLORS[block.type].tint }}
                        className="shrink-0 border-r border-white"
                      />
                    ))}
                  </span>
                  <span className="mt-0.5 flex h-0.5">
                    {timing.blocks.map((block) => (
                      <span
                        key={block.id}
                        style={{
                          flexBasis: `${(block.minutes / span) * 100}%`,
                          backgroundColor: block.isWriting ? WRITING_COLOR : 'transparent',
                        }}
                        className="shrink-0"
                      />
                    ))}
                  </span>
                </span>
                <span className="w-24 text-right text-xs font-semibold" style={{ color: WRITING_COLOR }}>
                  {timing.writingPercent}% writing
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TemplateChip({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <span
      data-testid="template-chip"
      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
    >
      Using your template: {name}
      <button type="button" aria-label="Stop using this template" onClick={onClear}>
        <X size={12} />
      </button>
    </span>
  );
}

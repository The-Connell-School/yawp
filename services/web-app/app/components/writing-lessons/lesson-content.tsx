import { ParsedLesson } from '~/utils/writing-lessons/topics';
import { CheckCircle2, Lightbulb, BookOpen, Eye } from 'lucide-react';

interface LessonContentProps {
  lesson: ParsedLesson;
}

export function LessonContent({ lesson }: LessonContentProps) {
  return (
    <div className="prose prose-sm max-w-none space-y-8">
      {/* Why This Matters */}
      <section className="rounded-lg bg-primary/5 border border-primary/20 p-6">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-lg font-semibold mb-3 mt-0">Why This Matters</h2>
            <p className="text-muted-foreground leading-relaxed">{lesson.hook}</p>
          </div>
        </div>
      </section>

      {/* The Rule */}
      <section>
        <div className="flex items-start gap-3 mb-4">
          <BookOpen className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
          <h2 className="text-lg font-semibold mt-0">The Rule</h2>
        </div>
        <p className="text-muted-foreground leading-relaxed pl-8">{lesson.rule}</p>
      </section>

      {/* See It In Action */}
      <section>
        <div className="flex items-start gap-3 mb-4">
          <Eye className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
          <h2 className="text-lg font-semibold mt-0">See It In Action</h2>
        </div>
        <div className="space-y-6 pl-8">
          {lesson.examples.map((example, index) => (
            <div key={index} className="space-y-3">
              {/* Before */}
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4">
                <div className="text-xs font-medium text-destructive mb-2">
                  BEFORE
                </div>
                <p className="text-sm text-muted-foreground">{example.before}</p>
              </div>

              {/* After */}
              <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-4">
                <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">
                  AFTER
                </div>
                <p className="text-sm text-muted-foreground">{example.after}</p>
              </div>

              {/* Explanation */}
              {example.explanation && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground pl-4">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="italic">{example.explanation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Quick Tip */}
      <section className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-yellow-500/10 p-2">
            <Lightbulb className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-2 mt-0">Quick Tip</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {lesson.tip}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

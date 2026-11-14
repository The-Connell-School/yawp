import { cn } from '~/utils/misc';

type Props = {
  instructionsCompleted: number;
  totalSteps: number;
};

/** Segmented progress under the instruction title (design export Nov 14). */
export function TutorStepProgress({
  instructionsCompleted,
  totalSteps,
}: Props) {
  if (totalSteps <= 0) return null;

  return (
    <div className="doc-editor-tutor-progress" aria-hidden>
      {Array.from({ length: totalSteps }, (_, index) => (
        <span
          key={index}
          className={cn(
            'doc-editor-tutor-progress-seg',
            index < instructionsCompleted && 'is-done',
            index === instructionsCompleted && 'is-current',
            index > instructionsCompleted && 'is-upcoming'
          )}
        />
      ))}
    </div>
  );
}
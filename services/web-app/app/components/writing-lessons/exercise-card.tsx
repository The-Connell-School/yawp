import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Textarea } from '~/components/ui/textarea';
import { Button } from '~/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Exercise } from '~/utils/writing-lessons/topics';

interface ExerciseCardProps {
  exercise: Exercise;
  exerciseNumber: number;
  totalExercises: number;
  sessionId: string;
  exerciseIndex: number;
  onCorrect: () => void;
}

export function ExerciseCard({
  exercise,
  exerciseNumber,
  totalExercises,
  sessionId,
  exerciseIndex,
  onCorrect,
}: ExerciseCardProps) {
  const [response, setResponse] = useState('');
  const fetcher = useFetcher<{ isCorrect: boolean; feedback: string }>();
  const isSubmitting = fetcher.state !== 'idle';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!response.trim()) return;

    fetcher.submit(
      {
        sessionId,
        exerciseIndex: exerciseIndex.toString(),
        response,
      },
      {
        method: 'POST',
        action: '/api/domain/writing-lessons/evaluate',
      }
    );
  };

  // Check if we got a response and it's correct
  if (fetcher.data?.isCorrect) {
    setTimeout(() => onCorrect(), 1500);
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Exercise {exerciseNumber} of {totalExercises}
        </span>
        <div className="flex gap-1">
          {Array.from({ length: totalExercises }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-8 rounded-full ${
                i < exerciseNumber - 1
                  ? 'bg-primary'
                  : i === exerciseNumber - 1
                    ? 'bg-primary/50'
                    : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Exercise Prompt */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            {exercise.instruction}
          </div>
          <div className="rounded bg-muted p-4 font-mono text-sm">
            {exercise.prompt}
          </div>
        </div>

        {/* Response Input */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Your revision:
            </label>
            <Textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Type your revised sentence here..."
              className="min-h-[100px] font-mono"
              disabled={isSubmitting || fetcher.data?.isCorrect}
            />
          </div>

          <Button
            type="submit"
            disabled={!response.trim() || isSubmitting || fetcher.data?.isCorrect}
            className="w-full"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {fetcher.data?.isCorrect ? 'Correct!' : 'Check Answer'}
          </Button>
        </form>
      </div>

      {/* Feedback */}
      {fetcher.data && (
        <div
          className={`rounded-lg border p-4 ${
            fetcher.data.isCorrect
              ? 'bg-green-500/5 border-green-500/20'
              : 'bg-yellow-500/5 border-yellow-500/20'
          }`}
        >
          <div
            className={`text-sm font-medium mb-2 ${
              fetcher.data.isCorrect
                ? 'text-green-600 dark:text-green-400'
                : 'text-yellow-600 dark:text-yellow-400'
            }`}
          >
            {fetcher.data.isCorrect ? '✓ Correct!' : 'Not quite...'}
          </div>
          <p className="text-sm text-muted-foreground">{fetcher.data.feedback}</p>
        </div>
      )}
    </div>
  );
}

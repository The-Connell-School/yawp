import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface FeedbackDisplayProps {
  isCorrect: boolean;
  feedback: string;
  attemptNumber: number;
}

export function FeedbackDisplay({
  isCorrect,
  feedback,
  attemptNumber,
}: FeedbackDisplayProps) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        isCorrect
          ? 'bg-green-500/5 border-green-500/20'
          : attemptNumber >= 3
            ? 'bg-blue-500/5 border-blue-500/20'
            : 'bg-yellow-500/5 border-yellow-500/20'
      }`}
    >
      <div className="flex items-start gap-3">
        {isCorrect ? (
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
        ) : attemptNumber >= 3 ? (
          <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        )}

        <div className="flex-1">
          <div
            className={`text-sm font-medium mb-1 ${
              isCorrect
                ? 'text-green-600 dark:text-green-400'
                : attemptNumber >= 3
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-yellow-600 dark:text-yellow-400'
            }`}
          >
            {isCorrect
              ? '✓ Correct!'
              : attemptNumber >= 3
                ? `Attempt ${attemptNumber} — Let me help more`
                : 'Not quite...'}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {feedback}
          </p>
        </div>
      </div>
    </div>
  );
}

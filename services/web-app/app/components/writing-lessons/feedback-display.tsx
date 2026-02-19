import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '~/utils/misc';

type FeedbackDisplayProps = {
	isCorrect: boolean;
	feedback: string;
	attemptNumber: number;
};

export function FeedbackDisplay({
	isCorrect,
	feedback,
	attemptNumber,
}: FeedbackDisplayProps) {
	return (
		<div
			className={cn(
				'flex gap-3 rounded-lg border p-4',
				isCorrect
					? 'border-green-200 bg-green-50 text-green-900'
					: 'border-amber-200 bg-amber-50 text-amber-900',
			)}
		>
			<div className="mt-0.5 shrink-0">
				{isCorrect ? (
					<CheckCircle2 className="h-5 w-5 text-green-600" />
				) : (
					<XCircle className="h-5 w-5 text-amber-600" />
				)}
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium">
					{isCorrect ? 'Correct!' : `Try again (attempt ${attemptNumber})`}
				</p>
				<p className="text-sm leading-relaxed">{feedback}</p>
			</div>
		</div>
	);
}

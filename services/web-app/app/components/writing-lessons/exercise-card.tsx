import { useState } from 'react';
import { cn } from '~/utils/misc';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { FeedbackDisplay } from './feedback-display';

type ExerciseCardProps = {
	exerciseNumber: number;
	prompt: string;
	instruction: string;
	onSubmit: (response: string) => void;
	isSubmitting?: boolean;
	feedback?: { isCorrect: boolean; feedback: string } | null;
	disabled?: boolean;
};

export function ExerciseCard({
	exerciseNumber,
	prompt,
	instruction,
	onSubmit,
	isSubmitting,
	feedback,
	disabled,
}: ExerciseCardProps) {
	const [response, setResponse] = useState('');
	const [attemptCount, setAttemptCount] = useState(0);

	function handleSubmit() {
		if (!response.trim()) return;
		setAttemptCount((prev) => prev + 1);
		onSubmit(response);
	}

	return (
		<Card
			className={cn(
				feedback?.isCorrect && 'border-green-300',
			)}
		>
			<CardHeader>
				<CardTitle className="text-lg">
					Exercise {exerciseNumber}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="rounded-md bg-muted p-4">
					<p className="text-sm font-medium leading-relaxed">{prompt}</p>
				</div>

				<p className="text-sm text-muted-foreground">{instruction}</p>

				<Textarea
					placeholder="Write your response here..."
					value={response}
					onChange={(e) => setResponse(e.target.value)}
					disabled={disabled || isSubmitting || feedback?.isCorrect}
					className="min-h-[120px] resize-y"
				/>

				<div className="flex justify-end">
					<Button
						onClick={handleSubmit}
						disabled={
							!response.trim() ||
							disabled ||
							isSubmitting ||
							feedback?.isCorrect
						}
						isLoading={isSubmitting}
					>
						{feedback?.isCorrect ? 'Completed' : 'Submit'}
					</Button>
				</div>

				{feedback ? (
					<>
						<Separator />
						<FeedbackDisplay
							isCorrect={feedback.isCorrect}
							feedback={feedback.feedback}
							attemptNumber={attemptCount}
						/>
					</>
				) : null}
			</CardContent>
		</Card>
	);
}

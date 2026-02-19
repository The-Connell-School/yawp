import { Link } from 'react-router';
import { Book } from 'lucide-react';
import { cn } from '~/utils/misc';
import { Button } from '~/components/ui/button';

type AssignmentAlertProps = {
	lessonTitle: string;
	dueAt?: string | null;
	lessonId: string;
};

export function AssignmentAlert({
	lessonTitle,
	dueAt,
	lessonId,
}: AssignmentAlertProps) {
	const formattedDueDate = dueAt
		? new Date(dueAt).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			})
		: null;

	return (
		<div
			className={cn(
				'flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 px-5 py-4',
			)}
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
				<Book className="h-5 w-5 text-primary" />
			</div>
			<div className="flex-1">
				<p className="text-sm font-medium">
					Your teacher assigned:{' '}
					<span className="font-semibold">{lessonTitle}</span>
				</p>
				{formattedDueDate ? (
					<p className="mt-0.5 text-xs text-muted-foreground">
						Due by {formattedDueDate}
					</p>
				) : null}
			</div>
			<Button variant="outline-primary" size="sm" asChild>
				<Link to={`/app/writing-lessons/${lessonId}`}>
					Start Lesson
				</Link>
			</Button>
		</div>
	);
}

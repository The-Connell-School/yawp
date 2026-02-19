import { Link } from 'react-router';
import { cn } from '~/utils/misc';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';

type TopicCardProps = {
	topicKey: string;
	name: string;
	description: string;
	category: string;
	hasAssignment?: boolean;
};

export function TopicCard({
	topicKey,
	name,
	description,
	category,
	hasAssignment,
}: TopicCardProps) {
	return (
		<Link
			to={`/app/writing-lessons/${topicKey}`}
			className="group block"
		>
			<Card
				className={cn(
					'h-full transition-all duration-200',
					'hover:border-primary/50 hover:shadow-md',
					'group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2',
				)}
			>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between gap-2">
						<Badge variant="secondary" size="sm">
							{category}
						</Badge>
						{hasAssignment ? (
							<Badge variant="info-outlined" size="sm">
								Assigned
							</Badge>
						) : null}
					</div>
					<CardTitle className="text-lg">{name}</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground line-clamp-2">
						{description}
					</p>
				</CardContent>
			</Card>
		</Link>
	);
}

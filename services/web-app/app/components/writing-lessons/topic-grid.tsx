import { TopicCard } from './topic-card';

type Topic = {
	topicKey: string;
	name: string;
	description: string;
	category: string;
};

type TopicGroup = {
	category: string;
	topics: Array<Topic>;
};

type TopicGridProps = {
	topicsGrouped: Array<TopicGroup>;
	assignments?: Array<{ topic: string }>;
};

export function TopicGrid({ topicsGrouped, assignments }: TopicGridProps) {
	const assignedTopicKeys = new Set(
		assignments?.map((a) => a.topic) ?? [],
	);

	return (
		<div className="space-y-8">
			{topicsGrouped.map((group) => (
				<section key={group.category}>
					<h2 className="mb-4 text-xl font-semibold tracking-tight">
						{group.category}
					</h2>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{group.topics.map((topic) => (
							<TopicCard
								key={topic.topicKey}
								topicKey={topic.topicKey}
								name={topic.name}
								description={topic.description}
								category={topic.category}
								hasAssignment={assignedTopicKeys.has(topic.topicKey)}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

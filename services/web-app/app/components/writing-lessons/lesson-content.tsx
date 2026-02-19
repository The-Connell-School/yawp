import { cn } from '~/utils/misc';
import { Separator } from '~/components/ui/separator';

type LessonContentProps = {
	content: string;
	title: string;
};

export function LessonContent({ content, title }: LessonContentProps) {
	return (
		<article className="mx-auto max-w-3xl">
			<h1 className="text-3xl font-bold tracking-tight">{title}</h1>
			<Separator className="my-6" />
			<div
				className={cn(
					'prose prose-slate max-w-none',
					'prose-headings:font-semibold prose-headings:tracking-tight',
					'prose-h2:mt-8 prose-h2:text-2xl',
					'prose-h3:mt-6 prose-h3:text-xl',
					'prose-p:leading-7',
					'prose-li:leading-7',
					'prose-blockquote:border-l-primary prose-blockquote:italic',
					'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm',
					'prose-strong:font-semibold',
				)}
				dangerouslySetInnerHTML={{ __html: content }}
			/>
		</article>
	);
}

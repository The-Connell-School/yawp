import { type Document } from '@prisma/client'
import { Link, useFetcher } from '@remix-run/react'
import { timeAgo } from '../utils/timeAgo'
import { DotsVerticalIcon } from './icons'
import { Button } from './ui/button'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from './ui/dropdown-menu'
import { Tooltip } from './ui/tooltip'

type Props = JsonifyObject<{
	doc: Document & {
		courseModuleSessions: { courseModule: { title: string } }[]
	}
}>

export const DocumentLink = ({ doc }: Props) => {
	const deleteDocumentFetcher = useFetcher()

	return (
		<Link
			key={doc.id}
			to={`/app/documents/${doc.id}?ssv=1`}
			className="relative flex h-48 flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow"
		>
			<span className="absolute right-1 top-1 z-20 rounded-full border bg-primary px-2 py-0.5 text-xs text-primary-foreground">
				{doc.courseModuleSessions[0].courseModule.title}
			</span>
			{doc.html ? (
				<div
					dangerouslySetInnerHTML={{ __html: doc.html }}
					className="z-10 flex-1 scale-90 overflow-hidden p-3 font-times text-sm"
				/>
			) : (
				<p className="flex w-full flex-1 items-center justify-center p-3 text-lg text-muted-foreground/60">
					No preview.
				</p>
			)}
			<div className="flex items-center justify-between border-t bg-muted p-2 text-sm">
				<div className="flex flex-col">
					<h4>{doc.title || 'Untitled document'}</h4>
					<Tooltip
						delayDuration={200}
						text={new Date(doc.createdAt).toLocaleString('en-US', {
							year: 'numeric',
							month: '2-digit',
							day: '2-digit',
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						})}
					>
						<p className="mt-1 text-xs text-muted-foreground">
							Created{' '}
							<span className="underline">{timeAgo(doc.createdAt)}</span>
						</p>
					</Tooltip>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button
							size="icon-sm"
							variant="ghost"
							onClick={e => e.stopPropagation()}
						>
							<DotsVerticalIcon />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<deleteDocumentFetcher.Form
							method="DELETE"
							action={`/api/model/document/${doc.id}`}
						>
							<DropdownMenuItem asChild>
								<Button
									variant="ghost"
									className="w-full justify-start"
									onClick={e => e.stopPropagation()}
								>
									Delete
								</Button>
							</DropdownMenuItem>
						</deleteDocumentFetcher.Form>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</Link>
	)
}

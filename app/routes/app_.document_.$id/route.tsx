import { invariant } from '@epic-web/invariant'
import { type LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Link,
	useFetchers,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { useSpinDelay } from 'spin-delay'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Badge } from '#app/components/ui/badge'
import { button } from '#app/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '#app/components/ui/tabs'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { useUser } from '#app/hooks/useUser'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { redirectWithToast } from '#app/utils/toast.server'
import { Comments } from './comments'
import { Editor } from './editor'
import { Tutor } from './tutor'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'No document id found')
	const userId = await requireUserId(request)

	const doc = await prisma.document.findFirst({
		where: {
			id: params.id,
			OR: [
				{ userId },
				{
					user: {
						studentProfile: {
							workshopLeaderId: userId,
						},
					},
				},
			],
		},
		include: {
			user: true,
			courseModuleSessions: {
				orderBy: { courseModule: { position: 'asc' } },
				include: {
					courseModule: { include: { instructions: true } },
					messages: true,
				},
			},
			comments: {
				include: {
					user: { include: { image: { select: { id: true } } } },
					responses: {
						include: {
							user: { include: { image: { select: { id: true } } } },
						},
					},
				},
			},
		},
	})

	if (!doc) {
		return redirectWithToast('/app', {
			description: 'Document not found.',
			type: 'error',
		})
	}

	const totalInstructions = await prisma.courseModuleInstruction.count({
		where: {
			courseModule: {
				courseId: doc.courseModuleSessions[0].courseModule.courseId,
			},
		},
	})

	return json({ doc, totalInstructions })
}

export default function Route() {
	const data = useLoaderData<typeof loader>()
	const user = useUser()
	const breakpoint = useBreakpoint()
	const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '')
	const [searchParams, setSearchParams] = useSearchParams()
	const tab = searchParams.get('tab') ?? 'tutor'

	const updateDocumentFetcher = useFetchers().find(
		f => f.key === 'update-document',
	)
	const isPending = useSpinDelay(
		!!updateDocumentFetcher && updateDocumentFetcher?.state !== 'idle',
		{ minDuration: 500, delay: 0 },
	)

	const setValueInSearchParams = (value: string) => {
		const params = new URLSearchParams(searchParams)
		params.set('tab', value)
		setSearchParams(params)
	}

	return (
		<main className="flex h-screen w-screen flex-col overflow-hidden">
			<nav className="border-b">
				<div className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 px-3 py-2">
					<Link
						className={button({ variant: 'secondary', size: 'sm' })}
						to={`/app/courses/${data.doc.courseModuleSessions[0]?.courseModule.courseId}`}
					>
						<ArrowLeft className="h-4" />
						Exit
					</Link>
					{/* TODO: Make title editable with an inline input */}
					<h4>Document</h4>
					{data.doc && user.id !== data.doc?.userId ? (
						<Badge variant="info-outlined" className="md:text-md text-xs">
							{isMobile
								? data.doc.user.name
								: `Viewing work by ${data.doc.user.name}`}
						</Badge>
					) : null}
					{isPending ? (
						<div className="flex flex-grow items-center justify-end gap-1 text-muted-foreground/70">
							<Loader2 className="h-4 w-4 animate-spin" />
							<p className="text-sm">Saving</p>{' '}
						</div>
					) : (
						<div className="flex flex-grow items-center justify-end gap-1 text-muted-foreground/70">
							<Check className="h-4 w-4" />
							<p className="text-sm">Saved</p>
						</div>
					)}
				</div>
			</nav>
			<Tabs
				onValueChange={setValueInSearchParams}
				value={tab}
				className="md:hidden"
			>
				<TabsList className="w-full rounded-none border-b px-3">
					<TabsTrigger value="tutor" className="w-full">
						Tutor
					</TabsTrigger>
					<TabsTrigger value="editor" className="w-full">
						Editor
					</TabsTrigger>
					<TabsTrigger value="comments" className="w-full">
						Comments
					</TabsTrigger>
				</TabsList>
			</Tabs>
			<div className="mx-auto flex h-full w-full max-w-screen-2xl overflow-hidden">
				{isMobile && tab !== 'tutor' ? null : (
					<Tutor
						context={data.doc.html}
						cmss={data.doc.courseModuleSessions}
						totalInstructions={data.totalInstructions}
					/>
				)}
				{isMobile && tab !== 'editor' ? null : <Editor document={data.doc} />}
				{isMobile && tab !== 'comments' ? null : (
					<Comments comments={data.doc.comments} />
				)}
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

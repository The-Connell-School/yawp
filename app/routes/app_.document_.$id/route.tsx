import { invariant } from '@epic-web/invariant'
import {
	type LoaderFunctionArgs,
	json,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { useFetchers, useLoaderData, useNavigate } from '@remix-run/react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { useSpinDelay } from 'spin-delay'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Badge } from '#app/components/ui/badge'
import { Button } from '#app/components/ui/button'
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '#app/components/ui/tabs'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { useUser } from '#app/hooks/useUser'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { redirectWithToast } from '#app/utils/toast.server'
import { handleCreateDocumentComment } from './actions/create-document-comment/index.server'
import { handleCreateDocumentCommentResponse } from './actions/create-document-comment-response/index.server'
import { handleDeleteDocumentComment } from './actions/delete-document-comment/index.server'
import { handleIncrementInstruction } from './actions/increment-instruction/index.server'
import { handleTutorResponse } from './actions/tutor-response/index.server'
import { Comments } from './comments'
import { Editor } from './editor'
import { Tutor } from './tutor'
import { type ActionParams, Action } from './types'

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

// We need all of these actions in this file so that
// the loader is revalidated and updates the data
const subactions: {
	[key in Action]: (params: ActionParams) => Promise<any>
} = {
	[Action.TutorResponse]: handleTutorResponse,
	[Action.IncrementInstruction]: handleIncrementInstruction,
	[Action.CreateDocumentComment]: handleCreateDocumentComment,
	[Action.DeleteDocumentComment]: handleDeleteDocumentComment,
	[Action.CreateDocumentCommentResponse]: handleCreateDocumentCommentResponse,
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const subaction = formData.get('subaction') as Action

	if (!subaction || !subactions[subaction]) {
		return json({}, { status: 400 })
	}

	await subactions[subaction]({ formData, userId })
	return json({})
}

export default function Route() {
	const data = useLoaderData<typeof loader>()
	const user = useUser()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '')

	const updateDocumentFetcher = useFetchers().find(
		f => f.key === 'update-document',
	)
	const isPending = useSpinDelay(
		!!updateDocumentFetcher && updateDocumentFetcher?.state !== 'idle',
		{ minDuration: 500, delay: 0 },
	)

	return (
		<main className="flex h-screen w-screen flex-col overflow-hidden">
			<nav className="border-b">
				<div className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 px-3 py-2">
					<Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
						<ArrowLeft className="h-4" />
						Exit
					</Button>
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
			{isMobile ? (
				<Tabs defaultValue="tutor" className="h-[calc(100%-93px)] w-full">
					<TabsList className="w-full rounded-none px-3">
						<TabsTrigger value="tutor" className="w-full">
							Tutor
						</TabsTrigger>
						<TabsTrigger value="editor" className="w-full">
							Editor
						</TabsTrigger>
						<TabsTrigger value="subInteraction" className="w-full">
							Comments
						</TabsTrigger>
					</TabsList>
					<TabsContent value="tutor" className="mt-0 border-t">
						<Tutor
							context={data.doc.html}
							cmss={data.doc.courseModuleSessions}
							totalInstructions={data.totalInstructions}
						/>
					</TabsContent>
					<TabsContent value="editor" className="mt-0 border-t">
						<Editor document={data.doc} />
					</TabsContent>
					<TabsContent value="subInteraction" className="mt-0 border-t">
						<Comments comments={data.doc.comments} />
					</TabsContent>
				</Tabs>
			) : (
				<div className="mx-auto flex h-[calc(100%-53px)] max-h-[calc(100%-53px)] min-h-[calc(100%-53px)] w-full max-w-screen-2xl flex-col overflow-hidden md:flex-row">
					<Tutor
						context={data.doc.html}
						cmss={data.doc.courseModuleSessions}
						totalInstructions={data.totalInstructions}
					/>
					<Editor document={data.doc} />
					<Comments comments={data.doc.comments} />
				</div>
			)}
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

import { invariant } from '@epic-web/invariant'
import { type LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Link,
	useFetchers,
	useLoaderData,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { useEffect } from 'react'
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
import { DocumentVersions } from './_components/document-versions'
import { Comments } from './comments'
import { Editor } from './editor'
import { Tutor } from './tutor'

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'No document id found')
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const shouldSaveVersion = url.searchParams.get('ssv') === '1'

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
			versions: { orderBy: { createdAt: 'desc' } },
			user: { include: { studentProfile: true } },
			courseModuleSessions: {
				orderBy: { courseModule: { position: 'desc' } },
				include: {
					courseModule: {
						include: {
							instructions: true,
							course: {
								select: {
									courseModules: { select: { id: true, position: true } },
								},
							},
						},
					},
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

	if (shouldSaveVersion) {
		const latestVersion = doc.versions[0]
		if (doc.html && doc.text && latestVersion?.html !== doc.html) {
			prisma.documentVersion
				.create({
					data: { documentId: doc.id, html: doc.html, text: doc.text },
				})
				.catch(() => {})
		}
	}

	const currentCms = doc.courseModuleSessions[0]
	const nextCmId = currentCms.courseModule.course?.courseModules.find(
		cm => cm.position === currentCms.courseModule.position + 1,
	)?.id

	return json({ doc, currentCms, nextCmId, shouldSaveVersion })
}

const useIsUpdatingDocument = () => {
	const updateDocumentFetcher = useFetchers().find(
		f => f.key === 'update-document',
	)

	return useSpinDelay(
		!!updateDocumentFetcher && updateDocumentFetcher?.state !== 'idle',
		{ minDuration: 500, delay: 0 },
	)
}

export default function Route() {
	const data = useLoaderData<typeof loader>()
	const user = useUser()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const isMobile = ['base', 'sm', 'md'].includes(breakpoint ?? '')
	const [searchParams, setSearchParams] = useSearchParams()
	const tab = searchParams.get('tab') ?? 'tutor'
	const isViewingAsTeacher = data.doc && user.id !== data.doc?.userId
	const isUpdatingDocument = useIsUpdatingDocument()

	const changeTab = (value: string) => {
		const params = new URLSearchParams(searchParams)
		params.set('tab', value)
		setSearchParams(params)
	}

	useEffect(() => {
		if (data.shouldSaveVersion) {
			const { pathname, search } = window.location
			const searchParams = new URLSearchParams(search)
			searchParams.delete('ssv')
			navigate(`${pathname}?${searchParams}`, { replace: true })
		}
	}, [data.shouldSaveVersion, navigate])

	return (
		<main className="flex h-screen w-screen flex-col overflow-hidden">
			<nav className="border-b">
				<div className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 px-3 py-2">
					<Link
						className={button({ variant: 'secondary', size: 'sm' })}
						to={
							isViewingAsTeacher
								? `/app/students/${data.doc.user.studentProfile?.id}`
								: `/app/courses/${data.doc.courseModuleSessions[0]?.courseModule.courseId}`
						}
					>
						<ArrowLeft className="h-4" />
						Exit
					</Link>
					{/* TODO: Make title editable with an inline input */}
					<h4>Document</h4>
					<div className="h-[20px] border-r" />
					<DocumentVersions
						documentId={data.doc.id}
						versions={data.doc.versions}
					/>
					{isViewingAsTeacher ? (
						<Badge variant="info-outlined" className="md:text-md text-xs">
							{isMobile
								? data.doc.user.name
								: `Viewing work by ${data.doc.user.name}`}
						</Badge>
					) : null}
					{isUpdatingDocument ? (
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
			<Tabs onValueChange={changeTab} value={tab} className="md:hidden">
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
						docId={data.doc.id}
						context={data.doc.text}
						cms={data.currentCms}
						nextCmId={data.nextCmId}
					/>
				)}
				{isMobile && tab !== 'editor' ? null : <Editor doc={data.doc} />}
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

import {
	type LoaderFunctionArgs,
	json,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { ExternalLinkIcon, PlusIcon } from 'lucide-react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { useLocalStorage } from 'usehooks-ts'
import { z } from 'zod'
import { DocumentLink } from '#app/components/document-link.js'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { CaretLeftIcon } from '#app/components/icons'
import { NoDataPlaceholder } from '#app/components/no-data-placeholder.js'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '#app/components/ui/accordion'
import { Button } from '#app/components/ui/button'
import { useUser } from '#app/hooks/useUser.js'
import { getBase64Audio } from '#app/services/openai.js'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { cn, useIsPending } from '#app/utils/misc.js'
import { redirectWithToast } from '#app/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const [course, documents, resources] = await Promise.all([
		prisma.course.findUnique({
			where: { id: params.id },
			include: { image: true, courseModules: true },
		}),
		prisma.document.findMany({
			where: {
				userId,
				deletedAt: null,
				courseModuleSessions: {
					some: { courseModule: { courseId: params.id } },
				},
			},
			include: {
				courseModuleSessions: {
					take: 1,
					orderBy: { courseModule: { position: 'desc' } },
					include: { courseModule: true },
				},
			},
		}),
		prisma.courseResource.findMany({ where: { courseId: params.id } }),
	])

	if (!course) {
		return redirectWithToast('/app', {
			type: 'error',
			description: 'Course not found',
		})
	}

	return json({ course, documents, resources })
}

const validator = withZod(
	z.object({
		audioEnabled: z.union([z.literal('true'), z.literal('false')]),
	}),
)

export async function action({ request, params }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const firstCourseModule = await prisma.courseModule.findFirst({
		where: { courseId: params.id },
		orderBy: { position: 'asc' },
		include: { instructions: true },
	})

	if (!firstCourseModule) {
		return redirectWithToast(`/app/courses/${params.id}`, {
			type: 'error',
			description: 'No course modules for this course.',
		})
	}

	const firstInstruction = firstCourseModule.instructions[0]
	const shouldFetchAudio =
		data.audioEnabled &&
		firstInstruction?.prompt &&
		!(await prisma.instructionAudio.findUnique({
			where: { courseModuleInstructionId: firstInstruction.id },
		}))

	const audio = shouldFetchAudio
		? await getBase64Audio(firstInstruction.prompt, '1.5')
		: null

	const [doc] = await Promise.all([
		prisma.document.create({
			data: {
				userId,
				text: '',
				html: '',
				title: '',
				courseModuleSessions: {
					create: {
						userId,
						instructionsCompleted: 0,
						courseModuleId: firstCourseModule.id,
						...(firstInstruction && {
							messages: {
								create: [
									{
										content: firstInstruction.prompt,
										agent: 'assistant',
										instructionId: firstInstruction.id,
									},
								],
							},
						}),
					},
				},
			},
		}),
		...(audio
			? [
					prisma.instructionAudio.create({
						data: {
							courseModuleInstructionId: firstInstruction.id,
							blob: Buffer.from(audio, 'base64'),
						},
					}),
				]
			: []),
	])

	return redirectWithToast(`/app/documents/${doc.id}?spa=1`, {
		type: 'success',
		description: 'Document created successfully.',
	})
}

export default function AppCoursesIdRoute() {
	const user = useUser()
	const isPending = useIsPending()
	const data = useLoaderData<typeof loader>()
	const isTeacher = !!user.teacherProfile
	const hasModules = data.course.courseModules.length > 0
	const [speechEnabled] = useLocalStorage('speechEnabled', false)

	return (
		<div className="no-scrollbar h-full w-full overflow-y-scroll">
			<div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 sm:p-5">
				<div className="mb-4 flex justify-between gap-2">
					<Button asChild variant="outline">
						<Link to="/app" className="w-fit">
							<CaretLeftIcon className="mr-1 h-5 w-5" /> Back to dashboard
						</Link>
					</Button>
					<ValidatedForm method="post" validator={validator}>
						<input
							type="hidden"
							value={speechEnabled ? 'true' : 'false'}
							name="audioEnabled"
						/>
						<Button
							type="submit"
							className="w-fit"
							disabled={!hasModules}
							isLoading={isPending}
						>
							New <PlusIcon className="ml-1 h-5 w-5" />
						</Button>
					</ValidatedForm>
				</div>
				<div className="flex flex-col items-start gap-6 pb-6 sm:flex-row">
					{data.course.image ? (
						<img
							src={`/api/image/course/${data.course.image.id}`}
							alt={data.course.title}
							className="h-auto w-screen min-w-[170px] max-w-[250px] rounded-lg object-cover"
						/>
					) : null}
					<div className="flex flex-col gap-3">
						<h1 className="text-3xl font-bold">{data.course.title}</h1>
						<p className="text-sm sm:text-base">{data.course.description}</p>
					</div>
				</div>
				{hasModules ? (
					<>
						<h3 className="mb-2 text-foreground/75">Modules</h3>
						<div className="border-b" />
						<Accordion type="multiple" className="pb-6">
							{data.course.courseModules.map(cm => (
								<AccordionItem key={cm.id} value={cm.id}>
									<AccordionTrigger className="py-2 text-base">
										{cm.title}
									</AccordionTrigger>
									<AccordionContent className="text-muted-foreground">
										{cm.description || 'No description.'}
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					</>
				) : null}
				{isTeacher ? (
					<div>
						<h3 className="text-foreground/75">Resources</h3>
						<p className="mb-2 text-sm text-muted-foreground">
							Explore documents and resources.
						</p>
						{data.resources.length ? (
							<div>
								{data.resources.map((resource, index) => (
									<div
										key={resource.id}
										className={cn('flex-flex-col py-2', {
											'border-t': index !== 0,
										})}
									>
										<a
											href={resource.url!}
											className="flex items-center gap-1 text-primary hover:underline"
											target="_blank"
											rel="noreferrer"
										>
											{resource.title}
											<ExternalLinkIcon size={14} />
										</a>
										<p className="text-sm text-muted-foreground">
											{resource.description}
										</p>
									</div>
								))}
							</div>
						) : (
							<NoDataPlaceholder
								title="No resources"
								subtitle="Come back later to check for newly added resources."
							/>
						)}
					</div>
				) : null}
				{isTeacher ? (
					<h3 className="mt-6 text-foreground/75">Documents</h3>
				) : null}
				{data.documents.length ? (
					<div className="grid grid-cols-2 gap-3 pb-10 pt-6 sm:grid-cols-2 md:grid-cols-3">
						{data.documents.map(doc => (
							<DocumentLink key={doc.id} doc={doc} />
						))}
					</div>
				) : !hasModules ? (
					<NoDataPlaceholder
						title="No modules"
						subtitle="Come back later to check for modules to work through."
					/>
				) : (
					<NoDataPlaceholder
						title="No documents"
						subtitle={
							<>
								Hit the <code className="px-1">New +</code> button above to
								create your first document.
							</>
						}
					/>
				)}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

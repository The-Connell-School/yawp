import { json, type ActionFunctionArgs } from '@remix-run/node'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import {
	AgentType,
	type Message,
	getLLMCompletion,
} from '#app/utils/getLLMCompletion'

const LLM_FAILED = 'Failed to get a response from the tutor. Please try again.'

export enum InstructionInteraction {
	Answer = 'answer',
	Dialogue = 'dialogue',
}

const POST = withZod(
	z.object({
		context: z.string().nullish(),
		response: z.string().min(1),
		cmsId: z.string().min(1),
	}),
)

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const { error, data } = await POST.validate(formData)
	if (error) return validationError(error)

	const cms = await prisma.courseModuleSession.findUnique({
		where: {
			id: data.cmsId,
			OR: [
				{ userId },
				{ user: { studentProfile: { workshopLeaderId: userId } } },
			],
		},
		include: {
			courseModule: { include: { instructions: true } },
			messages: true,
		},
	})

	if (!cms) {
		return json({ error: 'No course module session found' }, { status: 404 })
	}

	const instruction = cms.courseModule.instructions[cms.instructionsCompleted]
	if (!instruction) {
		return json({ error: 'No current instruction found.' }, { status: 404 })
	}

	if (instruction.interactiveType === InstructionInteraction.Answer) {
		if (!instruction.answerKey?.length) {
			const nextInstruction =
				cms.courseModule.instructions[cms.instructionsCompleted + 1]

			const updated = await prisma.courseModuleSession.update({
				where: { id: cms.id },
				data: {
					instructionsCompleted: { increment: 1 },
					messages: {
						create: [
							{
								content: data.response,
								agent: AgentType.User,
								instructionId: instruction.id,
							},
							...(nextInstruction
								? [
										{
											agent: AgentType.Assistant,
											content: nextInstruction.prompt,
											instructionId: nextInstruction.id,
										},
									]
								: []),
						],
					},
				},
			})

			return json(updated)
		} else {
			const system = `
				${cms.courseModule.tutorInstructions}
				_response_ = '${data.response}'
				_content_ = '${data.context}'
				_answerKey_ = '${instruction.answerKey}
				Respond with 'true' if the provided _response_ or _content_ satisfies the requirements of the _answerKey_. Else respond with 'false'.
				`

			const messages: Message[] = [
				{
					role: AgentType.User,
					content:
						'Does the response satisfy the requirements of the answer key?',
				},
			]

			let completion: string | undefined
			try {
				completion = await getLLMCompletion({
					model: 'claude-3-opus-20240229',
					messages,
					system,
					maxTokens: 500,
				})
			} catch {
				return json({ error: LLM_FAILED }, { status: 500 })
			}

			if (completion === 'true') {
				const nextInstruction =
					cms.courseModule.instructions[cms.instructionsCompleted + 1]

				const updated = await prisma.courseModuleSession.update({
					where: { id: cms.id },
					data: {
						instructionsCompleted: { increment: 1 },
						messages: {
							create: [
								{
									content: data.response,
									agent: AgentType.User,
									instructionId: instruction.id,
								},
								...(nextInstruction
									? [
											{
												agent: AgentType.Assistant,
												content: nextInstruction.prompt,
												instructionId: nextInstruction.id,
											},
										]
									: []),
							],
						},
					},
				})

				return json(updated)
			} else {
				const system = `
				Encourage the user to try again. They attempted to satisfy the _answerKey_ with the _response_ or _content_ provided and it wasn't sufficient.
				Do not include the value of _answerKey_ in your response.
				Do not include the word following words or phrases in your response: 'answerKey', 'true', 'false', 'requirements', 'do not worry'.
				Begin your response with a message that encourages the user to keep going.
				Keep your response short and concise.
				_response_ = '${data.response}'
				_content_ = '${data.context}'
				_answerKey_ = '${instruction.answerKey}`

				const messages: Message[] = [
					{
						role: AgentType.User,
						content: 'I missed the mark.',
					},
				]

				let correction: string | undefined
				try {
					correction = await getLLMCompletion({
						model: 'claude-3-opus-20240229',
						messages,
						system,
						maxTokens: 500,
					})
				} catch {
					return json({ error: LLM_FAILED }, { status: 500 })
				}

				const updated = await prisma.courseModuleSession.update({
					where: { id: cms.id },
					data: {
						messages: {
							create: [
								{
									agent: AgentType.User,
									content: data.response,
									instructionId: instruction.id,
								},
								{
									agent: AgentType.Assistant,
									content: correction,
									instructionId: instruction.id,
								},
							],
						},
					},
				})

				return json(updated)
			}
		}
	}

	if (instruction.interactiveType === InstructionInteraction.Dialogue) {
		const system = `
		${cms.courseModule.tutorInstructions}
		${instruction.tutorInstructions}`

		const currentMessages = cms.messages.map(m => ({
			role: m.agent as AgentType,
			content: m.content,
			name: m.agent,
		}))

		const messages: { role: AgentType; content: string; name?: string }[] = [
			{
				role: AgentType.User,
				content: `
				Get started! Begin your message by introducing me.
				Pretend I am a person you are talking to.
				Address me like you are talking first, and then I will respond.`,
			},
		]
			.concat(currentMessages)
			.concat([
				{
					role: AgentType.User,
					content: `content = '${data.context}', response = ${data.response}`,
				},
			])

		let completion: string | undefined
		try {
			completion = await getLLMCompletion({
				model: 'claude-3-opus-20240229',
				messages,
				system,
				maxTokens: 500,
			})
		} catch {
			return json({ error: LLM_FAILED }, { status: 500 })
		}

		const updated = await prisma.courseModuleSession.update({
			where: { id: cms.id },
			data: {
				messages: {
					create: [
						{
							agent: AgentType.User,
							content: data.response,
							context: data.context,
							instructionId: instruction.id,
						},
						{
							agent: AgentType.Assistant,
							content: completion,
							instructionId: instruction.id,
						},
					],
				},
			},
		})

		return json(updated)
	}

	return json(
		{ error: 'No instruction interaction type found.' },
		{ status: 404 },
	)
}


import { data as dataResponse, type ActionFunctionArgs } from 'react-router'
import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { z } from 'zod'
import { getBase64Audio } from '~/services/openai.js'
import { prisma } from '~/utils/db.server'
import {
	AgentType,
	type Message,
	getLLMCompletion,
} from '~/utils/getLLMCompletion'

const LLM_FAILED = 'Failed to get a response from the tutor. Please try again.'

export enum InstructionInteraction {
	Answer = 'answer',
	Dialogue = 'dialogue',
}

const POST = withZod(
	z.object({
		response: z.string().min(1),
		cmsId: z.string().min(1),
		speechSpeed: z.string().optional(),
		speechEnabled: z.union([z.literal('true'), z.literal('false')]),
	}),
)

const errorResponse = (error: { message: string }) => {
	return dataResponse(
		{ error: LLM_FAILED + 'Error: ' + error.message },
		{ status: 500 },
	)
}

export async function action({ request }: ActionFunctionArgs) {
	try {
		const formData = await request.formData()
		const { error, data } = await POST.validate(formData)
		if (error) return validationError(error)

		const cms = await prisma.courseModuleSession.findUnique({
			where: {
				id: data.cmsId,
			},
			include: {
				courseModule: { include: { instructions: true } },
				messages: true,
				document: { select: { text: true } },
			},
		})

		if (!cms) {
			return dataResponse({ error: 'No course module session found' }, { status: 404 })
		}

		const instruction = cms.courseModule.instructions[cms.instructionsCompleted]
		if (!instruction) {
			return dataResponse({ error: 'No current instruction found.' }, { status: 404 })
		}

		if (instruction.interactiveType === InstructionInteraction.Answer) {
			if (!instruction.answerKey?.length) {
				// Answer is correct, move on to next instruction
				const nextInstruction =
					cms.courseModule.instructions[cms.instructionsCompleted + 1]

				await prisma.courseModuleSession.update({
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

				let audio = ''
				if (data.speechEnabled === 'true') {
					const audioData = await prisma.instructionAudio.findUnique({
						where: { courseModuleInstructionId: nextInstruction.id },
					})
					if (!audioData) {
						audio = await getBase64Audio(
							nextInstruction.prompt,
							data.speechSpeed,
						)

						await prisma.instructionAudio.create({
							data: {
								courseModuleInstructionId: nextInstruction.id,
								blob: Buffer.from(audio, 'base64'),
							},
						})
					} else {
						audio = audioData.blob.toString()
					}
				}
				return dataResponse({ audio })
			} else {
				// Answer needs to be verified by the ai tutor
				const system = `
				${cms.courseModule.tutorInstructions}
				response = '${data.response}'
				content = '${cms.document.text}'
				answerKey = '${instruction.answerKey}
				Respond with 'true' if the answerKey is correctly addressed and answered by the provided response and/or content. Else respond with 'false'.
				`

				const messages: Message[] = [
					{
						role: AgentType.User,
						content: 'Are the requirements of the answer key satisified?',
					},
				]

				let completion: string | undefined
				try {
					completion = await getLLMCompletion({
						model: process.env.AI_MODEL as any,
						messages,
						system,
						maxTokens: 500,
					})
				} catch (error) {
					return errorResponse(error as any)
				}

				if (completion === 'true') {
					// Answer is correct, move on to next instruction
					const nextInstruction =
						cms.courseModule.instructions[cms.instructionsCompleted + 1]

					await prisma.courseModuleSession.update({
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

					let audio = ''
					if (data.speechEnabled === 'true') {
						const audioData = await prisma.instructionAudio.findUnique({
							where: { courseModuleInstructionId: nextInstruction.id },
						})
						if (!audioData) {
							audio = await getBase64Audio(
								nextInstruction.prompt,
								data.speechSpeed,
							)

							await prisma.instructionAudio.create({
								data: {
									courseModuleInstructionId: nextInstruction.id,
									blob: Buffer.from(audio, 'base64'),
								},
							})
						} else {
							audio = audioData.blob.toString()
						}
					}

					return dataResponse({ audio })
				} else {
					// Answer is incorrect, tutor will provide feedback
					const system = `
				Encourage the user to try again. They attempted to satisfy the _answerKey_ with the _response_ or _content_ provided and it wasn't sufficient.
				Do not include the value of _answerKey_ in your response.
				Do not include the word following words or phrases in your response: 'answerKey', 'true', 'false', 'requirements', 'do not worry'.
				Begin your response with a message that encourages the user to keep going.
				Keep your response short and concise.
				response = '${data.response}'
				content = '${cms.document.text}'
				answerKey = '${instruction.answerKey}`

					const messages: Message[] = [
						{
							role: AgentType.User,
							content: 'I missed the mark.',
						},
					]

					let correction: string
					try {
						correction = await getLLMCompletion({
							model: process.env.AI_MODEL as any,
							messages,
							system,
							maxTokens: 500,
						})
					} catch (error) {
						return errorResponse(error as any)
					}

					await prisma.courseModuleSession.update({
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

					return dataResponse({
						audio:
							data.speechEnabled === 'true'
								? await getBase64Audio(correction, data.speechSpeed)
								: '',
					})
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
						content: `content = '${cms.document.text}', response = '${data.response}'`,
					},
				])

			let completion: string
			try {
				completion = await getLLMCompletion({
					model: process.env.AI_MODEL as any,
					messages,
					system,
					maxTokens: 500,
				})
			} catch (error) {
				return errorResponse(error as any)
			}

			await prisma.courseModuleSession.update({
				where: { id: cms.id },
				data: {
					messages: {
						create: [
							{
								agent: AgentType.User,
								content: data.response,
								context: cms.document.text,
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

			return dataResponse({
				audio:
					data.speechEnabled === 'true'
						? await getBase64Audio(completion, data.speechSpeed)
						: '',
			})
		}

		return dataResponse(
			{ error: 'No instruction interaction type found.' },
			{ status: 404 },
		)
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error(error)
		return dataResponse({ error: 'An error occurred.' }, { status: 500 })
	}
}

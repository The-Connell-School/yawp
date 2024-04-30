import { withZod } from '@remix-validated-form/with-zod'
import { validationError } from 'remix-validated-form'
import { prisma } from '#app/utils/db.server.js'
import { getLLMCompletion } from '#app/utils/getLLMCompletion/getLLMCompletion.js'
import { type ActionParams } from '../../types'
import { Schema } from './schema'

const COMPLETION_TEXT = 'answer_satisifed'

const validator = withZod(Schema)

export const handleTutorResponse = async ({
	userId,
	formData,
}: ActionParams) => {
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const where = {
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
		id: data.cmsId,
	}

	const cms = await prisma.courseModuleSession.findFirst({
		where,
		include: {
			courseModule: { include: { instructions: true } },
			messages: true,
			document: true,
		},
	})

	const instruction = cms?.courseModule.instructions[cms?.instructionsCompleted]
	if (!instruction) {
		throw new Error('No current instruction found')
	}

	const systemPrompt = `instructions = ###
You are a tutor who helps users work through course material.
You encouraging understanding and improvement.
You never ask the user for "what's the next step" or similar. You always know what is next.
You ask more questions than you answer, though you will provide factual information when requested.
You are supportive, instructive, and witty, enhancing the user's learning experience and confidence.
Your response should be no longer than 3 sentences exactly.
You don't create, write, or make content for the user.

${cms?.courseModule.tutorInstructions ?? ''}

${
	instruction.interactiveType === 'answer'
		? `If the user_input is a question or request for help, then respond with a helpful answer or explanation no longer than 4 sentences long. Once you have answered the user's question, ask them if that answered the question. If yes, direct them to continue working toward the answer. Don't disclose the answer. If no, ask them to clarify or provide more information.
Else if the user_input is a statement, or comment, respond accordingly.
Else if the user_input is a sign of completion (e.g. "I'm done"), then do the following, step-by-step:
1. Compare the user_content with the answer_key and then...
2. Your response should be an aswer to this question: does the user_content contain a value that satisifes the answer_key requirements? (not your response)
- If it does, respond with "answer_satisfied" character for character.
- If it doesn't, respond with feedback to guide the student closer to the answer_key without disclosing it directly.
Your hint should aim to facilitate learning.
Never disclose the answer_key directly
Your response should be no more than 2 sentences long, max. No exceptions.
You pretend to now know the answer_key nor that you know there even is an answer. However, you can guide the user toward the answer_key.
Ask questions to guide the user to the answer_key.`
		: ''
}
###

initial prompt given to the user = ###
${instruction.prompt}
###
${
	instruction.interactiveType === 'answer'
		? `answer_key = ###
${instruction.answerKey}
###`
		: ''
}
`

	const userPrompt = `user_content = ###
${cms.document?.text ?? ''}
###
user_input = ###
${data.response}
###`

	await prisma.courseModuleSession.update({
		where,
		data: {
			messages: {
				create: [
					{
						context: data.context,
						content: data.response,
						instructionId: instruction.id,
						factCheckPrompt: userPrompt,
						agent: 'user',
					},
				],
			},
		},
	})

	const messages = cms.messages
		.filter(m => m.instructionId === instruction.id)
		.map(m => ({
			role: m.agent === 'user' ? 'user' : ('assistant' as any),
			content: m.agent === 'user' ? m.factCheckPrompt ?? m.content : m.content,
			name: m.agent,
		}))
		.slice(1)
		.concat([{ role: 'user' as any, content: userPrompt, name: 'user' }])

	const hasAnswerKey = instruction.answerKey?.replace(/\n/g, '')
	const message = hasAnswerKey
		? await getLLMCompletion({
				model: 'claude-3-opus-20240229',
				messages,
				system: systemPrompt,
				maxTokens: 500,
			})
		: COMPLETION_TEXT

	if (message === COMPLETION_TEXT) {
		if (instruction.concludingPrompt?.length) {
			await prisma.courseModuleSession.update({
				where,
				data: {
					messages: {
						create: {
							agent: 'assistant',
							instructionId: instruction.id,
							context: cms.document?.text ?? '',
							content:
								instruction.concludingPromptType ===
								'hardcoded-concluding-prompt'
									? instruction.concludingPrompt
									: await getLLMCompletion({
											model: 'claude-3-opus-20240229',
											system: `You are a tutor. Your response should wrap up the tutoring session.`,
											messages: cms.messages
												.filter(m => m.instructionId === instruction.id)
												.map((m, i) => ({
													role:
														m.agent === 'user' ? 'user' : ('assistant' as any),
													content:
														m.agent === 'user'
															? (i === cms.messages.length - 1
																	? m.factCheckPrompt +
																		(instruction.concludingPrompt ?? '')
																	: m.factCheckPrompt) ?? m.content
															: m.content,
													name: m.agent,
												}))
												.slice(1),
										}),
						},
					},
				},
			})
		}

		const instructions = cms.courseModule.instructions
		const nextInstructionIndex = cms.instructionsCompleted + 1
		const context = cms.document?.text ?? ''

		await prisma.courseModuleSession.update({
			where: { id: cms.id },
			data: {
				instructionsCompleted: { increment: 1 },
				...(cms.courseModule.instructions.length > cms.instructionsCompleted + 1
					? {
							messages: {
								create: [
									{
										context,
										instructionId:
											cms.courseModule.instructions[nextInstructionIndex].id,
										content:
											instructions[nextInstructionIndex].promptType ===
											'hardcoded'
												? instructions[nextInstructionIndex].prompt
												: await getLLMCompletion({
														model: 'claude-3-opus-20240229',
														system: `You are a tutor.
You create instructions for students to follow.
Here are your instructions for how to respond to the user's request to move on to the next step.
Don't mention that the user requested guidence. Just begin your instruction as if you are guiding the user.

instructions = ###
${instructions[nextInstructionIndex]?.prompt}
###

user_content = ###
${context}
###
`,
														maxTokens: 800,
														messages: [
															{
																role: 'user',
																content: `Please instruct me on what my next task is.`,
															},
														],
													}),
										agent: 'assistant',
									},
								],
							},
						}
					: {}),
			},
		})
	} else {
		await prisma.courseModuleSession.update({
			where,
			data: {
				messages: {
					create: [
						{
							content: message,
							instructionId: instruction.id,
							agent: 'assistant',
						},
					],
				},
			},
		})
	}
}

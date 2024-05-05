/* eslint-disable no-console */
import { anthropic } from '#app/services/anthropic'
import { openai } from '#app/services/openai'

export enum AgentType {
	User = 'user',
	Assistant = 'assistant',
}

export type Message = { role: AgentType; content: string; name?: string }

interface Params {
	messages: { role: 'user' | 'assistant'; content: string; name?: string }[]
	system?: string
	temperature?: number
	maxTokens?: number
	model: 'gpt-4-turbo-preview' | 'claude-3-opus-20240229'
}

export async function getLLMCompletion(params: Params) {
	if (process.env.NODE_ENV === 'development') {
		console.log('🧪 LLM completion started')
	}

	if (['claude-3-opus-20240229'].includes(params.model)) {
		console.time('🧪 LLM completion finished')
		const system = params.system?.replace(/\t/g, '')
		const messages = params.messages.map(({ name: _, ...m }) => ({
			...m,
			content: m.content.replace(/\t/g, ''),
		}))

		const message = await anthropic.messages.create({
			max_tokens: params.maxTokens ?? 1024,
			model: params.model,
			system,
			messages,
			temperature: 0.6,
		})

		if (process.env.NODE_ENV === 'development' && message) {
			console.log({
				...params,
				system,
				messages,
				response: message.content[0].text ?? '',
			})
			console.timeEnd('🧪 LLM completion finished')
		}

		return message.content[0].text ?? ''
	}

	if (['gpt-4-turbo-preview'].includes(params.model)) {
		console.time('🧪 LLM completion finished')
		const message = await openai.chat.completions.create({
			model: params.model,
			max_tokens: params.maxTokens,
			temperature: 0.6,
			messages: [
				...(params.system
					? [
							{
								role: 'system' as const,
								content: params.system.replace(/\t/g, ''),
							},
						]
					: []),
				...params.messages.map(m => ({
					...m,
					content: m.content.replace(/\t/g, ''),
				})),
			],
		})

		if (process.env.NODE_ENV === 'development' && message) {
			console.log({
				...params,
				system: params.system?.replace(/\t/g, ''),
				response: message.choices[0].message.content ?? '',
				messages: message.choices.map(c => c.message.content),
			})
			console.timeEnd('🧪 LLM completion finished')
		}

		return message.choices[0].message.content ?? ''
	}

	return ''
}

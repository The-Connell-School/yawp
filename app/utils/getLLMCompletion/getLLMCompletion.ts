interface Params {
	messages: { role: 'user' | 'assistant'; content: string; name?: string }[]
	system?: string
	temperature?: number
	maxTokens?: number
	model: 'gpt-4-turbo-preview' | 'claude-3-opus-20240229'
}

export async function getLLMCompletion(params: Params) {
	if (['claude-3-opus-20240229'].includes(params.model)) {
		const { anthropic } = await import('../../services/anthropic')
		const message = await anthropic.messages.create({
			max_tokens: params.maxTokens ?? 1024,
			model: params.model,
			system: params.system,
			messages: params.messages.map(({ name: _, ...m }) => m),
			temperature: params.temperature,
		})

		return message.content[0].text ?? ''
	}

	if (['gpt-4-turbo-preview'].includes(params.model)) {
		const { openai } = await import('../../services/openai')
		const message = await openai.chat.completions.create({
			model: params.model,
			max_tokens: params.maxTokens,
			temperature: params.temperature,
			messages: [
				...(params.system
					? [{ role: 'system' as const, content: params.system }]
					: []),
				...params.messages,
			],
		})

		return message.choices[0].message.content ?? ''
	}

	return ''
}

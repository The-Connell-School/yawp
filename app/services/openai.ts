import OpenAI from 'openai'

export const openai = new OpenAI({ organization: process.env.OPENAI_ORG })

export const getBase64Audio = async (input: string, speed?: string) => {
	const mp3 = await openai.audio.speech.create({
		model: 'tts-1',
		input,
		voice: 'echo',
		speed: parseInt(speed ?? '') || undefined,
	})

	const base64Audio = Buffer.from(await mp3.arrayBuffer()).toString('base64')

	return base64Audio
}

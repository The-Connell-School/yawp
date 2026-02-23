import OpenAI from 'openai';

let client: OpenAI | undefined;
if (process.env.OPENAI_ORG_ID && process.env.OPENAI_API_KEY) {
  client = new OpenAI({ organization: process.env.OPENAI_ORG_ID });
}

export const openai = client;

export const getBase64Audio = async (input: string, speed?: string) => {
  if (!openai) {
    return;
  }

  const mp3 = await openai.audio.speech.create({
    model: 'tts-1',
    input,
    voice: 'onyx',
    speed: parseInt(speed ?? '') || undefined,
  });

  const base64Audio = Buffer.from(await mp3.arrayBuffer()).toString('base64');

  return base64Audio;
};

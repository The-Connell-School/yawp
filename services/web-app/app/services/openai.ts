import OpenAI from 'openai';

type OpenAiClientEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_ORG_ID?: string;
};

export function getOpenAiClientOptions(env: OpenAiClientEnv) {
  if (!env.OPENAI_API_KEY) return undefined;

  return {
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_ORG_ID ? { organization: env.OPENAI_ORG_ID } : {}),
  };
}

let client: OpenAI | undefined;
const options = getOpenAiClientOptions({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
});
if (options) {
  client = new OpenAI(options);
}

export const openai = client;

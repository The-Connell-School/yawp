import OpenAI from 'openai';

let client: OpenAI | undefined;
if (process.env.OPENAI_ORG_ID && process.env.OPENAI_API_KEY) {
  client = new OpenAI({ organization: process.env.OPENAI_ORG_ID });
}

export const openai = client;

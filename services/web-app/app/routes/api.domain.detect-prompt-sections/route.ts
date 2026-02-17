import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { anthropic } from '~/services/anthropic';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z.object({
  studentCourseId: z.string().min(1),
});

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const prompt = await prisma.studentCourseWritingPrompt.findUnique({
    where: { studentCourseId: data.studentCourseId },
    select: { id: true, blob: true, contentType: true },
  });

  if (!prompt) {
    return dataResponse(
      { error: 'No writing prompt PDF found for this course.' },
      { status: 404 }
    );
  }

  const base64Pdf = Buffer.from(prompt.blob).toString('base64');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Pdf,
            },
          },
          {
            type: 'text',
            text: `Analyze this writing prompt document. Return a JSON object with exactly this structure:

{
  "extractedText": "The full text content of the document, preserving all questions and instructions.",
  "sections": [
    { "label": "Part A", "description": "Brief description of what this part asks" },
    { "label": "Part B", "description": "Brief description of what this part asks" }
  ]
}

Rules:
- extractedText should contain the complete text content of the document.
- If the document has clearly labeled parts/sections (Part A, Part B, Question 1, etc.), list each as a section.
- If there are no distinct sections (it's just one prompt), return an empty sections array.
- Keep section descriptions concise (one sentence).
- Return ONLY valid JSON, no other text.`,
          },
        ],
      },
    ],
  });

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : '';

  let parsed: { extractedText: string; sections: { label: string; description: string }[] };
  try {
    parsed = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from the response if it has surrounding text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      return dataResponse(
        { error: 'Failed to parse Claude response.' },
        { status: 500 }
      );
    }
  }

  // Save extracted text to the prompt record
  await prisma.studentCourseWritingPrompt.update({
    where: { id: prompt.id },
    data: { extractedText: parsed.extractedText },
  });

  return dataResponse({
    extractedText: parsed.extractedText,
    sections: parsed.sections,
  });
}

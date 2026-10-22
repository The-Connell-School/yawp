/**
 * The scripted model replies for the booth video, matched in order. Each rule
 * gets the request summary from fake-anthropic.mjs (system, lastUser,
 * transcript, tools, turn, lastMessageIsToolResult) and the raw body.
 *
 * Rules recognise each feature by its system prompt, so the app's real code
 * paths (parsing, saving, rendering) all run. The words come from copy.mjs.
 */
import {
  CLASS_SUMMARY,
  COMMA_SPLICE,
  GRADING_ASSISTANT,
  GRAMMAR_ISSUES,
  LESSON_PLAN,
  PRACTICE_QUESTIONS,
  PROMPT_GENERATOR_REPLY,
  TUTOR_FEEDBACK,
  TUTOR_REFUSAL,
  TUTOR_REPLY_1,
} from './copy.mjs';

const json = (value) => JSON.stringify(value);

export const rules = [
  {
    name: 'prompt-generator',
    when: (r) => r.system.startsWith('You are a writing-curriculum assistant'),
    reply: () => json(PROMPT_GENERATOR_REPLY),
  },
  {
    name: 'tutor',
    when: (r) => r.system.includes('student_document_context'),
    reply: (r) => {
      const said = r.lastUser.trim().toLowerCase();
      if (said.startsWith('give me feedback')) return TUTOR_FEEDBACK;
      if (said.includes('write my thesis') || said.includes('write it for me')) return TUTOR_REFUSAL;
      if (said.includes("it's the people")) return TUTOR_REPLY_1;
      return "Good thinking. Which piece of evidence from the novel best supports that idea? Name it, then tell me what it proves.";
    },
  },
  {
    name: 'grading-assistant',
    when: (r) => r.system.startsWith('You are a grading assistant.'),
    reply: (r) => {
      const firstName = r.lastUser.match(/Student first name:\s*([^\n]+)/)?.[1]?.trim() ?? 'Maya';
      return json({
        ...GRADING_ASSISTANT,
        overallComment: GRADING_ASSISTANT.overallComment.replace(/^Maya,/, `${firstName},`),
      });
    },
  },
  {
    name: 'grading-overall-comment',
    when: (r) => r.system.startsWith('You write the overall feedback sentence'),
    reply: () => json({ overallComment: GRADING_ASSISTANT.overallComment }),
  },
  {
    name: 'grammar-checker',
    when: (r) => r.system.startsWith('You are the Grammar/Usage Checker'),
    // Excerpts must appear verbatim in the essay, so only Maya's gets the splice.
    reply: (r) => json(r.lastUser.includes(COMMA_SPLICE) ? GRAMMAR_ISSUES : { issues: [] }),
  },
  {
    name: 'class-summary',
    when: (r) => r.system.includes('instructional coach helping a teacher understand how their whole class'),
    reply: () => json(CLASS_SUMMARY),
  },
  {
    // One real tool round first: the planner keeps a lesson link or resource
    // card only if a tool returned its href during the same request.
    name: 'lesson-planner',
    when: (r) => r.system.includes('Lesson Planner, an instructional design partner'),
    reply: (r) =>
      r.lastMessageIsToolResult || !r.tools.includes('get_writing_lesson')
        ? LESSON_PLAN
        : { tool: 'get_writing_lesson', input: { slug: 'analysis' } },
  },
  {
    name: 'act-practice',
    when: (r) => r.system.startsWith('You write ACT English'),
    reply: () => json(PRACTICE_QUESTIONS),
  },
  {
    name: 'practice-feedback',
    when: (r) => r.system.startsWith('You are a warm, sharp writing tutor'),
    reply: () =>
      json({
        status: 'strong',
        summary: 'Your semicolon joins two complete thoughts correctly, and the sentence still sounds like you.',
        strengths: ['Both halves are complete sentences, so the semicolon fits.', 'You kept the meaning of the original.'],
        focus: ['Try the same fix with a period, and notice how the rhythm changes.'],
        encouragement: 'That is exactly the move. Keep going.',
      }),
  },
];

export async function pickReply(request, body) {
  for (const rule of rules) {
    if (rule.when(request, body)) return { rule: rule.name, reply: await rule.reply(request, body) };
  }
  return { rule: 'UNSCRIPTED', reply: '[UNSCRIPTED reply from the booth-video stand-in]' };
}

/**
 * The grammar checker's prompts.
 *
 * Daily Pages "Time students have to write" used to calibrate these to a
 * writing time; that setting was removed before release, so the checker reads
 * every submission as untimed — the prompts every school has been graded with.
 */

const GRAMMAR_CHECKER_SYSTEM_PROMPT = `You are the Grammar/Usage Checker.\nReturn ONLY valid JSON with the schema:\n{\n  \"issues\": [{\n    \"excerpt\": string,\n    \"occurrence\"?: number,\n    \"kind\": \"error\"|\"style\",\n    \"ruleNumber\"?: number,\n    \"rule\"?: string,\n    \"message\": string\n  }]\n}\nRules:\n- Highlight the smallest exact excerpt that demonstrates the issue (max 120 characters).\n- If the excerpt appears multiple times, set occurrence to the 1-based match index.\n- Keep message brief (1-2 sentences). State the rule plainly; do not offer to fix it for the student.\n- Focus on essentials: usage, composition, comma/semicolon rules, and omit needless words.\n\nComma rules:\n(1) In a series of three or more terms with a single conjunction, use a comma after each term except the last.\n(2) Enclose parenthetic expressions between commas.\n(3) Do not join independent clauses with a comma (comma splice); use a semicolon, conjunction, or separate sentences.\nSemicolon rule:\nUse a semicolon to join closely related independent clauses.\n\nStyle:\n(10) Omit needless words.`;

export function buildGrammarCheckerSystemPrompt(): string {
  return GRAMMAR_CHECKER_SYSTEM_PROMPT;
}

export function buildGrammarCheckerUserPrompt(text: string): string {
  return `Essay:\n${text}\n\nReturn up to 15 issues.`;
}

/** The schema-repair retry. */
export function buildGrammarCheckerRetryUserPrompt(text: string): string {
  return `Essay:\n${text}\n\nReturn 8-12 issues using the exact schema. Do not include markdown.`;
}

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try {
  GlobalRegistrator.register();
} catch {}
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { act, forwardRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const admission = mock();
const provider = mock();
class AiFreeTierBudgetExceededError extends Error {}
class AiRateLimitError extends Error {}
const message =
  'AI tools are paused because this free-tier environment has reached its current budget.';
mock.module('~/utils/auth.server', () => ({
  requireUserId: async () => 'u1',
  requireMembership: async () => ({ id: 'm1', organization: { id: 'org1' } }),
}));
mock.module('~/utils/db.server', () => ({ prisma: {} }));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion: provider,
}));
mock.module('~/utils/ai-admission.server', () => ({
  AiFreeTierBudgetExceededError,
  AiRateLimitError,
  aiFreeTierBudgetExceededMessage: () => message,
  reserveAiRequest: admission,
}));
// Render the real runner with the real action response, without a network server.
const realRouter = { ...(await import('react-router')) };
let result: any = null;
mock.module('react-router', () => ({
  ...realRouter,
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
  useFetcher: () => ({
    data: result,
    state: 'idle',
    submit: () => {},
    Form: forwardRef<HTMLFormElement, any>(({ children, ...props }, ref) => (
      <form ref={ref} {...props}>
        {children}
      </form>
    )),
  }),
}));
const { action } = await import('~/routes/app.writing-lessons.practice/route');
const { PracticeRunner } = await import('./practice-runner');
let root: Root | null = null;
beforeEach(() => {
  provider.mockReset();
  admission.mockReset().mockRejectedValue(new AiFreeTierBudgetExceededError());
  result = null;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
afterAll(() => mock.restore());

async function renderDenial(questionId: string) {
  const response: any = await action({
    request: new Request('http://localhost/practice', {
      method: 'POST',
      body: new URLSearchParams({
        intent: 'check-rewrite',
        lessonSlug: 'fixing-comma-splices',
        questionId,
        exercise: 'It rained, we stayed inside.',
        instruction: 'Rewrite.',
        response: 'It rained; we stayed inside.',
      }),
    }),
    params: {},
    context: {},
  } as never);
  expect(response.init?.status).toBe(402);
  result = response.data;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <PracticeRunner
        eyebrow="Your practice"
        title="Comma splices"
        problemCount={1}
        hasComposition={false}
        backTo="/app"
        backLabel="Back"
        reviewFrom="/app"
        gradeActOnClient
        allowRewrite
        items={[
          {
            kind: 'act',
            position: 1,
            initialStatus: 'todo',
            lessonSlug: 'fixing-comma-splices',
            lessonTitle: 'Comma splices',
            question: {
              id: 'q1',
              sentence: 'It rained, we stayed inside.',
              underline: 'rained, we',
              choices: [
                'rained, we',
                'rained; we',
                'rained we',
                'rained, and, we',
              ],
              correctChoiceIndex: 1,
              explanation: 'Join clauses with a semicolon.',
            },
          },
        ]}
      />
    )
  );
  // Unlock the optional rewrite under the student's checked multiple choice.
  act(() =>
    (document.querySelector('input[type=radio]') as HTMLInputElement).click()
  );
  act(() =>
    (
      Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Check & save')
      ) as HTMLButtonElement
    ).click()
  );
  expect(
    document.querySelector('[data-testid=grammar-rewrite]')
  ).not.toBeNull();
}

test('the real budget-denied rewrite response appears beside the question without a tutor grade', async () => {
  await renderDenial('q1');
  const rewrite = document.querySelector('[data-testid=grammar-rewrite]')!;
  expect(rewrite.textContent).toContain(message);
  expect(rewrite.querySelector('[role=alert]')?.textContent).toContain(message);
  expect(rewrite.querySelector('[data-testid=practice-feedback]')).toBeNull();
  expect(rewrite.textContent).not.toContain('Strong');
  expect(provider).not.toHaveBeenCalled();
  expect(admission).toHaveBeenCalledTimes(1);
});

test('a denial for a different question is ignored', async () => {
  await renderDenial('old-question');
  expect(
    document.querySelector('[data-testid=grammar-rewrite]')?.textContent
  ).not.toContain(message);
  expect(provider).not.toHaveBeenCalled();
});

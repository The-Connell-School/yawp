import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
  GlobalRegistrator.register();
} catch {
  // Multiple Bun test files can share the same process.
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it } from 'bun:test';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { ExitTicketBuilderRevised } =
  await import('./exit-ticket-builder-revised');
const {
  EXIT_TICKET_SIMPLIFIED_INTERESTING_PROMPT,
  EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT,
  emptyExitTicketRevisedDraft,
} = await import('~/domain/assignment-types/exit-ticket');

let activeRoot: Root | null = null;
let container: HTMLDivElement;

function Harness({ initialGraded = true }: { initialGraded?: boolean }) {
  const [draft, setDraft] = useState(emptyExitTicketRevisedDraft());
  const [graded, setGraded] = useState(initialGraded);
  const [points, setPoints] = useState('5');
  return (
    <form>
      <ExitTicketBuilderRevised
        draft={draft}
        onDraftChange={(patch) =>
          setDraft((current) => ({ ...current, ...patch }))
        }
        graded={graded}
        onGradedChange={setGraded}
        pointValue={points}
        onPointValueChange={setPoints}
        disabled={false}
      />
    </form>
  );
}

function render(initialGraded = true) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness initialGraded={initialGraded} />));
  activeRoot = root;
}

afterEach(() => {
  if (activeRoot) act(() => activeRoot!.unmount());
  activeRoot = null;
  document.body.innerHTML = '';
});

const $ = <T extends Element>(selector: string) =>
  container.querySelector(selector) as T | null;
const promptBox = () =>
  $<HTMLTextAreaElement>('textarea[name="exitTicketPromptText"]')!;
const hidden = (name: string) =>
  $<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;

function click(id: string) {
  const el = container.querySelector(`#${id}`) as HTMLElement;
  act(() => el.click());
}

/** Calls the element's React onChange with its new value. */
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const propsKey = Object.keys(el).find((key) =>
    key.startsWith('__reactProps$')
  )!;
  const props = (el as unknown as Record<string, any>)[propsKey];
  act(() => {
    el.value = value;
    props.onChange({ target: el, currentTarget: el });
  });
}

describe('simplified exit ticket builder (Brian, Nov 24)', () => {
  it('opens on What I learned with its text in an editable Prompt box', () => {
    render();
    expect(promptBox().value).toBe(EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT);
    expect(container.textContent).toContain('Prompt');
    expect(container.textContent).toContain('(what students will see)');
    expect(container.textContent).not.toContain('What students will see');
    expect(hidden('exitTicketPromptVersion')).toBe('3');
  });

  it('shows the grading line under each card', () => {
    render();
    expect(container.textContent).toContain(
      'Reflections are graded on completion. An honest attempt gets full credit.'
    );
    expect(container.textContent).toContain(
      'Responses are graded on accuracy, based on the answer or notes you enter below.'
    );
  });

  it('switching presets swaps the text; Write your own starts empty', () => {
    render();
    click('assignment-create-exit-ticket-reflection-interesting');
    expect(promptBox().value).toBe(EXIT_TICKET_SIMPLIFIED_INTERESTING_PROMPT);
    click('assignment-create-exit-ticket-reflection-custom');
    expect(promptBox().value).toBe('');
    expect(promptBox().placeholder).toBe(
      'e.g., What did you relate to in today’s chapter?'
    );
    expect(container.textContent).not.toContain('Still wondering');
  });

  it('a minimum length replaces the aim line, and clearing it puts the aim line back', () => {
    render();
    const sentences = $<HTMLInputElement>(
      'input[name="exitTicketMinSentences"]'
    )!;
    const words = $<HTMLInputElement>('input[name="exitTicketMinWords"]')!;
    type(sentences, '3');
    expect(promptBox().value).toContain('(Write at least 3 sentences.)');
    expect(promptBox().value).not.toContain('(Aim for a few sentences.)');
    type(words, '50');
    expect(
      promptBox().value.endsWith('(Write at least 3 sentences and 50 words.)')
    ).toBe(true);
    type(sentences, '');
    type(words, '');
    expect(promptBox().value).toBe(EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT);
  });

  it('a check has option pills, the single-answer question, and one answer box that follows it', () => {
    render();
    click('assignment-create-exit-ticket-kind-check');
    expect(container.textContent).toContain('Explain a concept');
    expect(container.textContent).toContain('Understand a text or source');
    expect(container.textContent).not.toContain('Ask a question');
    expect(container.textContent).toContain(
      'Is there a single correct answer?'
    );
    expect(hidden('exitTicketSingleCorrectAnswer')).toBe('yes');
    expect(container.textContent).toContain('Correct answer');

    click('assignment-create-exit-ticket-focus-understand-text');
    expect(promptBox().placeholder).toBe(
      'e.g., What does Nick say Gatsby sprang from?'
    );
    const answer = () =>
      $<HTMLTextAreaElement>('textarea[name="exitTicketCorrectAnswer"]')!;
    expect(answer().placeholder).toBe('His Platonic conception of himself');
    expect(answer().required).toBe(true);

    click('assignment-create-exit-ticket-single-no');
    expect(hidden('exitTicketSingleCorrectAnswer')).toBe('no');
    expect(container.textContent).toContain('What a strong answer includes');
    expect(answer().required).toBe(false);
    expect(promptBox().placeholder).toContain(
      'sprang from his Platonic conception of himself'
    );
  });

  it('a check prompt gets the minimum added at the end', () => {
    render();
    click('assignment-create-exit-ticket-kind-check');
    type(promptBox(), 'What is an unreliable narrator?');
    type($<HTMLInputElement>('input[name="exitTicketMinWords"]')!, '50');
    expect(promptBox().value).toBe(
      'What is an unreliable narrator? (Write at least 50 words.)'
    );
  });

  it('ungrading takes the minimum line off the prompt', () => {
    render();
    type($<HTMLInputElement>('input[name="exitTicketMinSentences"]')!, '2');
    click('assignment-create-exit-ticket-graded');
    expect(promptBox().value).toBe(EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT);
  });
});

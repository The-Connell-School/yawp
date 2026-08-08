const WORDY_PHRASES = [
  'at this point in time',
  'due to the fact that',
  'for the purpose of',
  'has the ability to',
  'in order to',
  'in the event that',
];

export type PracticeCheck = {
  id: string;
  label: string;
  status: 'ok' | 'review';
};

export type PracticeSelfCheck = {
  wordCount: number;
  checks: PracticeCheck[];
};

/**
 * A mechanical self-check on a practice response. It reports only what can be
 * observed from the text itself — it is not a grade and it does not evaluate
 * grammar, meaning, or quality.
 */
export function getPracticeSelfCheck(
  response: string,
  exercise: string
): PracticeSelfCheck {
  const trimmed = response.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const isRevised = wordCount > 0 && normalize(trimmed) !== normalize(exercise);
  const endsWithPunctuation = /[.!?]["')\]]?$/.test(trimmed);
  const wordyPhrases = WORDY_PHRASES.filter((phrase) =>
    trimmed.toLowerCase().includes(phrase)
  );

  return {
    wordCount,
    checks: [
      {
        id: 'revised',
        label: isRevised
          ? 'Your response is different from the original sentence.'
          : 'Your response still matches the original sentence.',
        status: isRevised ? 'ok' : 'review',
      },
      {
        id: 'punctuation',
        label: endsWithPunctuation
          ? 'Your response ends with sentence punctuation.'
          : 'Your response does not end with a period, question mark, or exclamation point.',
        status: endsWithPunctuation ? 'ok' : 'review',
      },
      {
        id: 'wordy-phrases',
        label: wordyPhrases.length
          ? `Wordy phrase to look at: ${wordyPhrases.join(', ')}.`
          : 'None of the wordy phrases this check knows about appear in your response.',
        status: wordyPhrases.length ? 'review' : 'ok',
      },
    ],
  };
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

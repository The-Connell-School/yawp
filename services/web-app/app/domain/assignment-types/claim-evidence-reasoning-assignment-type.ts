import type {
  PromptConfigData,
  RubricData,
  ScoringScaleData,
} from '~/domain/assignment-types/assignment-type-rubric.shared';

export const CLAIM_EVIDENCE_REASONING_ASSIGNMENT_TYPE_KIND =
  'claim_evidence_reasoning';
export const CLAIM_EVIDENCE_REASONING_PROD_ASSIGNMENT_TYPE_ID =
  'cmwma1a58000301l3jqxcxr3j';
export const C_E_R_LIBRARY_RUBRIC_NAME = 'c-e-r';
export const C_E_R_LIBRARY_RUBRIC_TITLE = 'C-E-R';

export const CLAIM_EVIDENCE_REASONING_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
  step: 1,
};

export const CLAIM_EVIDENCE_REASONING_RUBRIC: RubricData = {
  categories: [
    {
      key: 'claim',
      label: 'Claim',
      weight: 0.34,
      description:
        'A clear, arguable claim that answers the prompt and tells the reader what the student thinks.',
    },
    {
      key: 'evidence',
      label: 'Evidence',
      weight: 0.33,
      description:
        'Specific evidence from the text or task that supports the claim and is explained, not just quoted.',
    },
    {
      key: 'reasoning',
      label: 'Reasoning',
      weight: 0.33,
      description:
        'Analysis that connects the evidence to the claim and shows why it proves the point.',
    },
  ],
};

export const CLAIM_EVIDENCE_REASONING_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions:
    'Grade this C-E-R (Claim-Evidence-Reasoning) response on claim, evidence, and reasoning. Anchor your read in the assignment prompt when it is available. Reward clear thinking and specific support; do not expect full essay structure.',
};
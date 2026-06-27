# Draft Email: UA AI Functionality Response

Status: Content approved by Bryant on 2026-06-27. Do not send until production
config is current at send time and the send target/thread is confirmed.

To: Mary Anne Canant <mcanant@ua.edu>

Subject: Re: Proposed agreement with University of Alabama

Hi Mary Anne,

Thank you for asking. YAWP! includes AI-assisted writing tutoring and grading
feedback features that are integrated into the YAWP! product workflow. Students
and teachers interact with YAWP!'s tutor and grading tools, not with a standalone
public chatbot.

Based on our current production infrastructure configuration, YAWP!'s primary
large language model provider is Anthropic, using a Claude Sonnet model
configured as `claude-sonnet-4-6`. OpenAI is also configured in the application
as an outage fallback provider for limited retry/fallback scenarios, with the
fallback model defaulting to `gpt-4o-mini` unless overridden by production
configuration.

The AI functionality is used to support:

- student writing tutoring and process feedback;
- teacher grading-assistant feedback;
- assignment/PDF extraction and related teacher setup workflows where enabled.

YAWP! controls the application workflow, user authentication, and product data
storage. AI calls are made from YAWP!'s server-side application as part of those
features. We can provide additional security, data-processing, and vendor
handling details through UA's security and compliance review process.

Best,

Brian

## Claims requiring Bryant sign-off before sending

- Bryant approved the email draft content on 2026-06-27.
- Exact production model name: current infra says `claude-sonnet-4-6`.
- Exact fallback behavior: code defaults OpenAI fallback to `gpt-4o-mini` when
  enabled and configured.
- Whether OpenAI fallback is actually enabled in production at send time.
- Provider data-use/training claim. This draft intentionally does not claim
  that provider-side data is or is not used for model training until the
  applicable account terms/contracts are confirmed.

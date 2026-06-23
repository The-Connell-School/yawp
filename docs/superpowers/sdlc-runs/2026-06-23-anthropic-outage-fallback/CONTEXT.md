# Context

Yawp relies on Anthropic for tutor and grading assistant interactions. A production screenshot showed Anthropic `529 overloaded_error` surfacing directly to students/teachers. Bryant requested a fast automatic fallback to a cheap OpenAI model, with a five-minute cache to avoid repeated failing Anthropic calls and simple `Retrying...` UI language while the app retries.

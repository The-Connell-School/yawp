# Daily Pages short-form prompt library

`prompts.json` is the canonical corpus for the Daily Pages prompt library. It
is a third corpus, not a variant of the other two, because Daily Pages asks for
something neither of them does.

|  | Class Starter (`../prompts-library`) | Daily Pages (here) | Thesis (`../thesis-prompts-library`) |
|---|---|---|---|
| Length | One line | One line, with a target | Multi-paragraph |
| Graded | Effort only | Like a short essay | Like an essay |
| Asks for support | No | **Yes, always** | Yes |
| Names a shape | No | A target length | Introduction → thesis → body → conclusion |

## The design constraint

The short-form rubric scores **Depth of Thought** and **Development of
Thought** above craft. A prompt that asks only for an opinion leaves those two
categories with nothing to read, and the entry stalls at the middle of the
scale no matter how the student writes it.

So every prompt here asks for the backing as well as the position — a reason, a
quotation, a case that tests the claim, a counterexample. That is not a style
preference; it is what makes the assignment gradeable. `data.test.ts` enforces
it, along with a length ceiling: a prompt long enough to need its own close
reading has already failed.

This is also the line against the Class Starter corpus. Those prompts tag texts
(`Great Gatsby`, `Hamlet`) but the text is *context* — you can answer "Agree or
disagree" without opening the book. Here, a prompt that names a text has to
admit it needs one, which is what `sourceNeed` records and what a test checks.

## Kinds

Prompts are grouped by `kind`, the primary facet. Each is a pattern that
reliably produces something the rubric can score in fifteen minutes.

| kind | what it sets up |
|---|---|
| `close-read` | back into the text for specific words |
| `claim-and-defend` | a position, its strongest reason, the case that tests it |
| `one-difference` | a comparison narrowed to the one distinction that matters |
| `evaluate-a-choice` | a judgment that has to name its own standard |
| `define-precisely` | a boundary drawn, then tested with a hard case |
| `exit-synthesis` | what changed today and what changed it — needs no reading |

## Schema

| field | meaning |
|---|---|
| `id` | stable, prefixed by kind (`sf-cr-`, `sf-cd-`, `sf-od-`, `sf-ev-`, `sf-dp-`, `sf-ex-`) |
| `title` | short row heading; the directive lives in `prompt` |
| `prompt` | the assignment text, used verbatim |
| `kind` | one of the six above |
| `cognitiveMoves` | the analytic set — deliberately not Class Starter's `introspect`/`tell-a-story` |
| `sourceNeed` | `required` / `optional` / `none` — the filter a teacher reaches for first |
| `lengthTarget` | `paragraph` / `half-page` / `page` |
| `textsOrUnits` | named texts this is anchored to; empty for portable prompts |
| `themes` | thematic tags, shared vocabulary with the Class Starter corpus |
| `gradeBands` | `9`–`12` |

## Adding prompts

Add to `prompts.json` and run the tests. They will reject a prompt that is too
long, that asks for an opinion without asking for the backing, or that names a
text while claiming to need no source. Those three failures are the ones that
would quietly produce an ungradeable assignment.

`lengthTarget` is not decoration: the rubric refuses to reward length, and a
student can only act on that if the assignment says where the finish line is.

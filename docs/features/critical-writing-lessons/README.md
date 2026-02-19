# Critical Writing Lessons

## Feature Overview

Targeted mini-lessons on 10 core writing skills for the YAWP! platform. Each lesson includes an engaging hook, clear explanation, before/after examples, a memorable quick tip, and progressive practice exercises with AI-powered feedback.

## Status

- **Lesson Content:** 10 of 10 lessons complete
- **AI Prompt System:** Complete (`prompt.md` in `services/web-app/app/utils/writing-lessons/`)
- **Lesson Generator Skill:** Complete (`skills/lesson-generator/SKILL.md`)
- **Implementation Plan:** Complete (`IMPLEMENTATION-PLAN.md` in this directory)
- **Database Schema:** Designed, not yet migrated
- **Routes & UI:** Not yet built

## The 10 Topics

### Punctuation
| # | Topic | Lesson Status |
|---|-------|---------------|
| 1 | Comma: Splices | Complete |
| 2 | Comma: Oxford/Serial | Complete |
| 3 | Comma: Introductory Phrases | Complete |
| 4 | Comma: Independent & Dependent Clauses | Complete |

### Sentence Structure
| # | Topic | Lesson Status |
|---|-------|---------------|
| 5 | Revising for Wordiness | Complete |
| 6 | Passive Voice | Complete |
| 7 | Parallel Construction | Complete |

### Agreement
| # | Topic | Lesson Status |
|---|-------|---------------|
| 8 | Subject-Verb Agreement | Complete |
| 9 | Pronoun Agreement | Complete |

### Flow
| # | Topic | Lesson Status |
|---|-------|---------------|
| 10 | Transition Sentences | Complete |

## Key Files

| File | Location | Purpose |
|------|----------|---------|
| `prompt.md` | `services/web-app/app/utils/writing-lessons/` | AI system prompt + all 9 example lessons |
| `topics.ts` | `services/web-app/app/utils/writing-lessons/` | Topic definitions as TypeScript constants |
| `SKILL.md` | `skills/lesson-generator/` | Claude Code skill for generating lessons on demand |
| `IMPLEMENTATION-PLAN.md` | `docs/features/critical-writing-lessons/` | Full build plan (DB schema, routes, components) |

## Educational Philosophy

YAWP! lessons are:
- **Student-centered** — Meet students where they are
- **Expert but humble** — Teach with authority AND kindness
- **Engaging** — Quick, cool explanations that respect students' time
- **Practical** — Real examples, not contrived textbook sentences
- **Guiding, not doing** — Help students recognize and fix issues themselves

## Next Steps

1. Implement Phase 1: Database schema + AI utilities
2. Implement Phase 2: Student-facing routes and UI
3. Implement Phase 3: Teacher-facing routes and UI
4. Implement Phase 4: Integration and polish

See `IMPLEMENTATION-PLAN.md` for full details.

# Demo walkthrough: GBA 300 collaborative writing

A click path for demoing the collaborative writing assignment, and the roster of
seeded students behind it. Nothing here creates data — the demo class is written
by `packages/prisma/scripts/local-dev/seed-collaboration.ts` from the plan in
`packages/prisma/scripts/local-dev/collab-demo-plan.ts`, which every seeded
environment already runs. This is the map, not the territory.

## Where the demo lives

| Environment | How it gets seeded |
| --- | --- |
| Local dev | `bash scripts/worktree-local-setup.sh` ends in `bun db:seed-local-dev` |
| PR preview | `preview-environments.yml` deploys with `PREVIEW_DATA_MODE=seed`, and each preview seat runs the same collaboration seed |
| Demo host | `demo-environment.yml`, same seed path (`DEMO_DATA_MODE` defaults to `seed`) |

The class is `DEV-CLASS-GBA300`, on assignment type `GBA 300: Int'l Expansion
Plan` — the only type with `collaborationSupported`, which is what the seed keys
off rather than the title. Every seeded login uses password `yawp-dev`; locally,
`/auth/dev-login` skips the password entirely.

## Logins worth having open

Start as the teacher; the group pages are the demo.

| Who | Email | Why they matter |
| --- | --- | --- |
| Alex Teacher | `dev.teacher@yawp.local` | Owns the class. Every teacher-side view below. |
| Sam Student | `dev.student@yawp.local` | Group 1 — the uneven draft with the teacher's question on it. |
| Riley Student | `dev.student.submitted@yawp.local` | Group 2 — the individual grade pulled *below* the group's. |
| Casey Student | `dev.student.graded@yawp.local` | Group 3 — came back days later to tighten a partner's sentence. |
| Taylor Student | `dev.student.unreleased@yawp.local` | Group 4 — the barely-started draft. |

The other eighteen students have no persona entry, so they are not in the local
dev-login picker; a preview's login picker lists every user in the organization,
so they are selectable there. Their addresses follow one pattern:
`dev.gba.<key>@yawp.local`.

## The seven groups

Each group is parked at a different point on purpose, so every surface has
something to show without anyone arranging groups or grading by hand.

| Group | Members | State | What to point at |
| --- | --- | --- | --- |
| 1 | Sam Student, Ben Alvarez (`ben`), Cy Nakamura (`cy`) | Drafting | Lopsided split — Sam wrote four paragraphs, Cy wrote `Advertising strategy: TODO`. Teacher comment asking who is taking the rest, and Ben's reply naming names. |
| 2 | Dee Whitfield (`dee`), Eli Barros (`eli`), Riley Student | Graded, released | Full rubric scores including a deliberate 25 on references. Riley's individual grade is overridden to 78 against a group A- (91), with feedback explaining why. |
| 3 | Fen Zhao (`fen`), Gia Petrov (`gia`), Casey Student | Submitted, awaiting grade | Casey's second sitting deletes text from Gia's paragraph — the only place the contribution panel's "Removed" column has anything in it. |
| 4 | Hal Mwangi (`hal`), Taylor Student, Ada Okonkwo (`ada`) | Barely started | Iris Novak contributed, then was moved to Group 5. Her sentence still renders, attributed to "Former student" rather than to a name off the roster. |
| 5 | Jae Lindqvist (`jae`), Kit Abara (`kit`), Lou Ferreira (`lou`), Iris Novak (`iris`) | Resubmitted | Submitted, sent back, submitted again. The withdrawn submission is still on the document, and Jae's revision of the freight sentence is the change that came out of it. |
| 6 | Mia Sokolov (`mia`), Noa Haddad (`noa`), Ravi Chandran (`ravi`) | Graded, **not** released | The state a teacher spends most of their marking time in. Executive summary scored 0 — absent. Ravi overridden to 80. |
| 7 | Sol Bramante (`sol`), Tao Nguyen (`tao`), Uma Beckett (`uma`) | Graded, even split | Three students who wrote roughly the same amount, nobody overridden, everyone on the group grade. The answer to "does this always single someone out?" is no. |

## A click path that holds together

1. **Teacher, class view** — seven groups at seven different stages, in one list.
2. **Group 1 draft** — open it. Show the contribution breakdown tinting each
   paragraph to its author, then the `TODO`, then the comment thread where the
   teacher asked about it and Ben answered.
3. **Group 3** — the same panel, but with deletions: Casey removed words from
   Gia's sentence, and the panel says so rather than reading Casey as a
   freeloader who wrote nothing that day.
4. **Group 4** — Iris's paragraph, labelled "Former student". She is on Group 5's
   roster now, and Group 4's grade cards correctly leave her out.
5. **Group 2, grading** — the group grade, then Riley's override sitting below
   it, then log in as Riley to confirm that is what a student sees.
6. **Group 6** — graded and withheld. Log in as Taylor to confirm nothing leaks.
7. **Group 5** — the withdrawn submission beside the current one, and the
   revision that came out of being sent back.
8. **Class insights** — every graded group carries per-category rubric scores, so
   the class performance summary and the differentiation groupings have three
   real data points rather than an empty state.

## If the demo is missing

The seed skips itself, loudly, when no assignment type has
`collaborationSupported` set — the prod-fidelity fixtures have to be imported
first. A skipped run prints a warning rather than failing, so check the seed
output before assuming the app is broken.

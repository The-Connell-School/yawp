# NCTE Booth Video (Philadelphia, Nov 19–22)

## Overview

A silent, looping, ~5-minute 1080p MP4 for the Yawp! booth at NCTE. It plays from a
USB stick on a rented screen, so it is a single self-contained file with no internet
needed. It has two jobs: pull in people walking past, and give Brian something to
point at while he talks to teachers. Everything is told on screen.

First cut to Brian by **November 10**, leaving a round of changes before the show.

## Decisions

- **Real app, real flows.** Recorded in the working app against a local demo
  database, not mocked screens. Teachers will ask "is that really it?"; the
  answer should be yes.
- **Scripted AI replies, said honestly.** The tutor, Grading Assistant, Class
  Summary and Lesson Planner replies are scripted for the recording, as the
  "See how it works" guides already do. The app runs unmodified and talks to a
  local stand-in for the Anthropic API (`ANTHROPIC_BASE_URL`) that returns the
  scripted replies, so every screen, save and render is the real code path. This
  also makes the loop deterministic: the refusal beat says exactly what we want.
- **Visual voiceover.** Three on-screen layers, styled after the in-app guided
  tour:
  1. *Title cards* between sections (section name plus a one-line promise).
  2. *Caption bar* along the bottom: the narrator line for the current beat.
  3. *Callouts*: tour-style popovers pointing at the thing being described.
- **Readable from the aisle.** The browser renders at 1536×864 CSS px with a
  1.25 device scale factor (1920×1080 physical), so UI text is 25% larger
  than a teacher's laptop. Captions are large (≥ 40px).
- **Capture.** Headful Chromium in Xvfb, recorded with ffmpeg `x11grab` and
  encoded as H.264 High, yuv420p, 30 fps, `+faststart`. Plays on any TV's USB
  player and on Mac/Windows. Not Playwright's built-in VP8 recorder, whose
  quality is too low for a big screen.
- **Branding.** "Yawp!" in every caption, callout and title card. The all-caps
  logo appears only as the logo.
- **Loops cleanly.** The video ends on the logo card and begins with a short
  cold-open card, so the cut from end to start reads as intentional.
- **Re-recordable.** The whole thing is driven from one script file
  (`storyboard`) holding every caption, callout and scripted AI reply. Brian's
  recorded commentary drops in there as caption and callout text, and a re-record
  is one command. That makes the round of changes before NCTE cheap.

## Storyboard (target ≈ 5:00)

| # | Section (title card) | What's on screen | Callouts / captions | ≈ s |
|---|---|---|---|---|
| 0 | Cold open | Logo + "The AI writing platform that won't write for your students." | n/a | 6 |
| 1 | **Make assignments for your class.** | Teacher dashboard → Thesis-Driven Essay → choose a prompt → assign to English 10, Period 3 | "Pick an assignment type built for how writing is taught." / "Send it to the class in a few clicks." | 35 |
| 2 | **The student experience.** | Student opens the assignment → pre-writing step. Time-lapse writing → **Give me feedback** → short back-and-forth with the tutor | "The tutor asks questions. It doesn't hand over answers." | 40 |
| 2b | (cont.) | Student asks the tutor to write it for them; tutor refuses and redirects | 1. "The student asks the tutor to write for them." 2. (tutor reply highlighted) 3. "The refusal is the point: Yawp! protects the cognitive friction students need to learn." | 30 |
| 2c | (cont.) | A little drafting (time-lapse) → **Submit** | "Every word is the student's own." | 15 |
| 3 | **Grading.** | Teacher opens an essay → runs the Grading Assistant → rubric scores and comments appear → teacher edits a score and a comment | "Teachers can change and edit anything the Grading Assistant does. The teacher has the final say." | 40 |
| 4 | **Revision.** | Teacher releases the grade → student opens the essay, sees feedback, revises and resubmits | "Feedback turns into revision, not just a number." | 25 |
| 5 | **What your class needs next.** | Class Summary for the thesis-driven essay: strengths, patterns, who needs what → suggested lessons | "This has never been available to teachers before." / "By the time you've graded 100 essays, you've forgotten the first half. Yawp! hasn't." | 45 |
| 6 | **Plan the lesson.** | Open the Lesson Planner from the suggestion: the chat, the stack of materials, the run of show | "From what your class needs to tomorrow's lesson." | 40 |
| 7 | **Writing practice.** | Writing lessons library → a lesson → an exercise | "Short lessons and practice, ready to assign." | 20 |
| 8 | Close | Logo, **yawp.school** | n/a | 8 |

Total ≈ 5:04. Section titles 1, 2, 3, 5 and 6 are Brian's wording verbatim.

## Demo data

- Teacher: Ms. Alvarez, English 10, Period 3, North Ridge High.
- 24 students with believable names and a full set of submitted thesis-driven
  essays on one prompt, written at a realistic spread of skill (strong, mid,
  struggling), so the Class Summary has real patterns to find.
- One featured student whose pre-writing and essay we watch. Brian offered
  pre-writing copy; until it arrives the cut uses copy written for this video,
  and swapping it in is a storyboard edit.
- A rich Class Summary for the thesis-driven essay (Brian: "those are the
  richest").

## Work plan

1. Map every beat to its route, controls and AI contract (what the code parses
   from the model).
2. Seed the booth demo data (script in `services/web-app/scripts/booth-video/`,
   local/demo databases only).
3. Build the harness: fake Anthropic server, overlay layer (captions, callouts,
   title cards), Xvfb + ffmpeg capture, storyboard file.
4. Record each section separately; assemble with ffmpeg (title cards, cross-fades).
5. QA: watch every frame at 1080p, check "Yawp!" spelling in all text, check
   duration, file size, and playback from a FAT32/exFAT USB stick (single file
   well under 4 GB).
6. Deliver the MP4 plus a contact sheet, and a list of what to send back
   (talking points, pre-writing copy, changes).

## Branding sweep (same request)

Separately, sweep the platform's user-facing copy, emails and model-facing
prompts for "YAWP!", "Yawp" and lowercase "yawp" used as our name, and switch
them to **Yawp!**. Leave the logo, URLs, identifiers and code comments alone.
Tests that assert the old copy are updated first.

## Open questions for Brian

- Pre-writing copy for the featured student: send it, and it goes straight in.
- Recorded talking points: send the audio or a transcript; the lines become
  captions and callouts in the storyboard file.
- Does the booth screen have a known resolution and orientation? The cut is
  1920×1080 landscape.

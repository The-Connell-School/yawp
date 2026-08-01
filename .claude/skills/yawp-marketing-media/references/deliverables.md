# Deliverable specs

What to produce for each ask, and what "done" looks like. Copy drafts follow
`brand.md`; captures follow the storyboard workflow in `SKILL.md`.

## Product demo video (60–120s)

The main asset. One audience, one story, one take.

- Storyboard: 5–8 scenes, one cue each, plus a mid-scene cue where something
  needs explaining.
- Open on the outcome, not the login screen. Close on the same screen you
  opened on, so the loop reads as closed.
- Narration: ~110 words per minute at Kokoro speed 1.08. A 90-second video is
  roughly 160 words of narration and a lot of deliberate silence.
- Output: H.264/AAC MP4, 1440×900. Plays on a phone without re-encoding.
- Ships with: a one-sentence description, a suggested title, and the screenshot
  set from the same run.

## Feature clip (5–15s)

One capability, one motion, for email, a release note, or a social post.

- 1–2 scenes. Usually zero cues — a silent clip with a caption lands better in
  a feed than narration nobody hears.
- Cut the navigation. Start on the screen where the feature lives, do the one
  thing (open the document, click the button), hold the result ~2 seconds, end.
- Ships with: the caption text, since the clip will usually autoplay muted.

## Screenshot set

For the site, a deck, a one-pager, or an app store style listing.

- Use `storyboards/feature-screenshots.json`, or add scenes to it.
- `deviceScaleFactor: 2` for anything shown larger than a thumbnail.
- Check every still for seeded names that read as real, stray console banners,
  and half-loaded lists.
- Ships with: a caption per image naming what the viewer is looking at.

## Landing or section copy

- Headline: 5–9 words, states what the product does for whom.
- Subhead: one sentence, concrete, no adjective stacking.
- Three feature blocks max per section, each with a screenshot from a real run.
- Every claim traceable to something on screen or to `brand.md`.

## Release or launch announcement

- Lead with what a teacher can now do that they could not do last week.
- One paragraph of context, one clip or screenshot, one next step.
- Check `docs/STATUS.md` first: anything behind a feature flag or mid-rollout is
  not announceable. Ask the user before writing about it.

## Sales one-pager

- Above the fold: what it is, who it is for, the teacher loop in three steps.
- Middle: three screenshots with captions.
- Bottom: how a school starts, and what it does not require (no installs, works
  with existing classes).
- No pricing, no numbers, no named customers unless the user provides them.

## Social post

- Platform-agnostic draft plus the clip or still.
- First line carries the whole idea; assume nobody expands the post.
- No hashtag stacks. One if it earns its place.

## Delivery checklist

Before handing anything back:

- [ ] Watched the video end to end, at delivery size.
- [ ] No real student, teacher, or school names anywhere in frame.
- [ ] Narration matches the screen at every cue.
- [ ] No flagged or unreleased feature presented as available.
- [ ] Files are outside the repo unless the user asked for them committed.
- [ ] Reported what failed or was skipped, not just what worked.

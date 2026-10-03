# How-to guides ("See how it works" pages)

Every major YAWP! feature gets a short how-to guide. It opens from a **See how it works** button on the feature's own page, and teachers can share it with an administrator or a department.

These rules come from Brian's review of the first guide, for the Lesson Planner (see PR #374, `/app/lesson-planner/how-it-works`).

## The job of a guide

A guide is the teaser that gets a teacher to try the feature. It is not the manual, the abstract, or the defense of how it was built.

> "You've got to put the hay down low enough where the goats can reach it."

The thinking behind a feature is ours. Teachers feel it the moment they use the feature. They don't need the blueprints to enjoy the building.

## Rules

1. **Less is more.** Give a teacher only what they need to jump in. One or two sentences per section, then a clip.
2. **Say what it does, in simple terms.** Don't describe what they'll experience: progress bars, what appears where, which screen comes next. They'll see it for themselves.
3. **Name the controls that matter, once.** "Answers are one tap: suggested replies, a slider for the period length, and a checklist of activity types" is the model. It tells a teacher what's possible without walking them through it.
4. **No secret sauce.** Don't explain how it works inside: prompts, rules it follows, what it searches, how it decides. Leave room for "I don't know how they did this, but you have to try it."
5. **Always include "What it will do / What it won't do."** Teachers get language to describe it to others. Schools, districts and regulators get what they need to approve it. The "won't" column matters most:
   - Lead with student safety and data: what it never does to or with students.
   - Every line has to be true in the code. Check it before you write it. If something is not true, leave it out rather than soften it. (Example: don't write "it never sends student data anywhere" if the AI model receives class scores.)
6. **Cut AI-sounding copy.** No "the notes carry the talking", "what came with this one", em-dash asides, "not X, but Y", or clever headings. Plain and direct: "Speaker notes included."
7. **Make headings say the thing.** "Create a full unit of study", not "A unit map first, then one day at a time."
8. **Show, with real clips.** Record in the working app with demo classes. Each clip shows one thing and loops. Keep the files small (1120px wide H.264, about 3 MB for a whole guide).
9. **Be honest about the demo.** One short footer line says the clips use demo classes, and that any AI replies shown were scripted for the recording if they were.
10. **No help chat on the guide.** Questions would mostly be answered by the page itself.

## Shape

1. **Hero:** one headline, one or two sentences, one still image.
2. **Where it lives:** where to find it, and one line on how to start. Add a second entry point only if teachers really use it.
3. **How it works:** 3 numbered steps at most, each a clip plus a short heading and one or two lines.
4. **Extras:** the other big things it makes (slides, printing, units). One clip and one line each.
5. **What it will do / What it won't do.**
6. **Footer:** the demo note and a button to start using it.

## Where it lives in the app

- Route: `/app/<feature>/how-it-works`, behind the same access check as the feature.
- Build it from `app/components/how-it-works/guide.tsx` (`GuidePage`, `GuideHero`, `GuideRow`, `GuideClip`, `WillWont`, `GuideFooter`, `SeeHowItWorksLink`). Reporter's guide is the example: `app/routes/app.reporter_.how-it-works/route.tsx`.
- Media: `public/img/<feature>-guide/`.
- Button: **See how it works**, in the feature's page header. Icon only on a phone, with an `aria-label`.
- Test: an E2E test that opens the guide from the button, checks the "won't" section and checks phone width.

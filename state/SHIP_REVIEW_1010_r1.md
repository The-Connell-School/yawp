# Ship Review r1 — PR #1010

**PR:** https://github.com/The-Connell-School/yawp/pull/1010
**Title:** Sidebar: Show/Hide labels toggle, working collapse arrow, Need help? menu
**Branch:** `fix/sidebar-labels-toggle-need-help`
**Base:** `main`
**Product head:** `f7e6c4fee7af3af76cc30298ba170501997cec25`
**Reviewer:** Cloud Agent (self-review on Brian's branch; no `.cursor/skills` Ship Review skill in repo)
**Date:** 2026-11-24

**SHIP** (pending exact-head CI green)

These are bug fixes that restore expected sidebar behavior. No feature flag, no migration, no new data model. Rollback is revert.

---

## Root causes

| Bug | Cause | Result |
| --- | --- | --- |
| Collapse arrow did nothing | `Button` defaults to `type="button"` (`button.tsx`). The expanded header control omitted `type`, so it never submitted `NavStateSwitch`. The logo-hover expand control already had `type="submit"`. | **Fixed.** Header collapse uses `AppNavHeaderCollapseButton` with `type="submit"`. |
| Sidebar stuck on icons | The only expand affordance was a hover on the collapsed logo. | **Kept from #1010.** Footer row "Show labels" / "Hide labels" posts the same nav cookie. Logo-hover double-chevron expand is unchanged. |
| Need help did nothing | Bare `mailto:support@yawp.school`. Browsers with no mail app fail silently. | **Kept from #1010.** Menu: Write in Gmail, Open my email app, Copy email address. Copy falls back to a prompt if the clipboard is blocked. |
| Free-tier reload undoes an expand | `useFreeTierNavAutoCollapse` (#941) starts `wasInNarrowBand` at `null`. `wasInNarrowBand !== true` treated every full load in the 640–1279px band as entering it and posted `collapsed`. | **Fixed.** A saved `expanded` or `collapsed` cookie wins on load. Crossing into the band from outside still collapses. A first visit with no cookie still collapses. |

---

## What changed vs #1010's original diff

Kept: `type="submit"` on the header collapse control, the labels row, the Need help menu, desktop-only placement (hidden in the mobile drawer), and the logo-hover expand.

Changed:

- Root loader sets `userPrefs.navPreferenceExplicit` from the nav cookie. The hook passes that into `shouldAutoCollapseFreeTierNavOnResize`.
- `font: inherit` on the labels button was overriding the footer’s 14px type. Removed. Measured after the change: Need help, Settings, and Hide labels are all 14px / weight 400 / `rgb(94, 93, 90)`, icons centered at the same x.
- Header collapse and the help menu panel are named components so tests can click them without a full app shell or a Radix portal.

Not rejected: the prompt fallback, the Gmail compose URL, or putting the labels row under Settings.

---

## Tests (reviewer-executed)

```text
bun test app/domain/free-tier/free-tier-nav-auto-collapse.test.ts \
  app/hooks/useFreeTierNavAutoCollapse.test.tsx \
  app/components/app-nav-collapse-toggle.test.tsx \
  app/components/app-nav-need-help.test.tsx
→ 21 pass, 0 fail
```

`NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck` in `services/web-app` → exit 0. The default Node heap OOMs on this machine; that is a local heap limit, not a type error.

Playwright spec added to the existing smoke file `teacher.sidebar-settings-short-viewport.spec.ts` (collapse arrow, logo-hover expand, labels row, reload, Need help menu). Not executed locally: the e2e harness starts its own server. The same flows were exercised in the browser.

---

## Browser

Local `bun dev` at 1440×900 and 1100×800.

- Licensed teacher: collapse arrow collapses; logo hover shows the expand chevron and expands; Hide labels / Show labels survive reload; Need help menu copies `support@yawp.school` and stays on `/app`.
- Free-tier teacher at 1100px: after Show labels, reload stays expanded (224px). Widening past 1280px and narrowing back to 1100px collapses to the icon rail (56px).

The free-tier shell needed the local `feature_flag.free_tier` setting turned on for that database. That setting is not in this diff.

---

## Merge recommendation

**Approve merge to `main` after exact-head CI is green.** No schema, billing, or auth change. Sidebar auto-collapse on entering the 640–1279px band remains for free-tier teachers who have not saved a preference, and for anyone whose viewport actually enters that band.

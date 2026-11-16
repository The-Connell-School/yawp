# Yawp! Button — Letterpress · implementation notes

Status: approved design (Nov 13). Prepared for implementation; not yet rolled out in other artifacts or in the app.

## Files in this package

| File | What it is |
|---|---|
| `button.css` | The source of truth: tokens (CSS variables) and every variant, size and state. Import once, globally. |
| `button.tsx` | Reference React component with the shadcn `<Button>` API, plus `useTransientSuccess`. |
| `button-spec.html` | Standalone spec page: anatomy, variant × state matrix, sizes, icons, in-context patterns, live demos, motion table, tokens, rules. Open it in a browser. |
| `student-editor.html` | The student editor main frame with the new buttons (static reference HTML). |
| `editor-states.html` | The full editor states board (teacher view, top bar, tutor, comments, toolbar, prompt, mobile) with the new buttons. |
| `assets/yawp-logo.png` | Logo used by the two editor exports. Keep the `assets/` folder next to them. |

The same spec is also on the **Design System · Button** page of the YAWP! Master Design canvas.

## The look in one sentence

A flat brand-green pill (#1f4d3a) with a 1 px darker rim, a faint top highlight and a 2 px pressed-in bottom edge: printed into the page, not floating above it.

## Variants

| Variant | Use | Old shadcn variant it replaces |
|---|---|---|
| `primary` | The one main action per screen/panel: Submit, Ready!, Grade, Create assignment, Save changes | `default` (terracotta/coral) |
| `secondary` | Real but secondary actions: Copy link, Duplicate, Edit, Cancel in forms | `outline` |
| `ghost` | Low-emphasis actions in dense UI: toolbar items, close, more, Cancel beside a primary | `ghost` |
| `destructive` | Only the confirming step of an irreversible action, labelled with the object ("Delete assignment") | `destructive` |
| `link` | Navigation inside text and headers | `link` |

Sizes: `sm` 32 px (top bars, toolbars, table rows), `default` 36 px, `lg` 44 px (mobile primary, Tutor Ready!, empty states), `icon` square at the current size. `block` makes it full width.

## States (all required)

| State | Trigger | Visual | Notes |
|---|---|---|---|
| Default | — | as above | |
| Hover | `:hover` | fill one step lighter (primary #245a44, secondary sand #f1ede3) | 120 ms, `cubic-bezier(0.2,0,0,1)`. Nothing moves. |
| Keyboard focus | `:focus-visible` | 2 px gap (#fffdf9) + 2 px ring `hsl(210 75% 49%)`, combined with the button's own shadows | Never shown on mouse click. |
| Pressed | `:active`, Enter/Space | moves down 1 px, bottom edge becomes a small inner shadow, fill one step darker | 60 ms in, 120 ms out. |
| Disabled | `disabled` or `aria-disabled="true"` | 45 % opacity, no edge, no press, `cursor: not-allowed` | Use `aria-disabled` (the `softDisabled` prop) whenever a tooltip has to explain why, so keyboard users can reach it. |
| Loading | `aria-busy="true"` | spinner leads, label becomes the -ing form ("Saving…", "Submitting…", "Creating…") | Full opacity. Width locked to the starting width. Clicks ignored. Spinner 0.8 s per turn. |
| Success (transient) | after the action succeeds | check icon + past tense of the same verb ("Saved", "Copied", "Submitted") | Held 2 s, then back to idle. Announce once via a `role="status"` region (toast or inline). |

Reduced motion: no 1 px press movement, no transitions, spinner slows to 2.4 s. Forced colours: 1 px `ButtonText` border, `Highlight` outline on focus.

## Contrast

Primary text 9.4:1, destructive 6.6:1, secondary/ghost ink on white or sand > 12:1. All pass WCAG AA for normal text; primary passes AAA.

## Rules for screens

1. One primary per screen or panel. If two actions both look primary, demote one to secondary.
2. Labels are verbs that say what happens; the loading and success labels reuse the same verb.
3. Sentence case. No arrow characters in labels; use the trailing arrow icon only for "go to the next place" (e.g. Set up groups).
4. Form footers: primary first, then Cancel (secondary). Left-aligned in full-page forms, right-aligned in sheets and dialogs.
5. Destructive buttons appear only inside the confirm step, next to a secondary Cancel.
6. Gold, terracotta and coral are no longer button colours.

## Rollout plan (suggested)

1. Add `button.css` globally and swap the internals of `~/components/ui/button` for `button.tsx`. The variant names stay compatible, so most call sites need no change.
2. Search for buttons styled by hand with `bg-primary`, `bg-[#…]`, coral or terracotta utility classes and move them onto `<Button variant=…>`.
3. Replace ad-hoc "Saving…" / "Copied" logic with `loading` / `success` props and `useTransientSuccess`.
4. QA with the checklist below on: student editor, assignment builder, class detail, dashboards, dialogs and sheets, mobile.

## QA checklist

- [ ] Every screen has at most one primary button.
- [ ] Tab through: focus ring visible on every button, never on mouse click.
- [ ] Press with mouse, Enter and Space: 1 px press, no layout shift around it.
- [ ] Loading: label changes, width does not, double-clicks do nothing.
- [ ] Success: shows 2 s, returns to idle, announced once to screen readers.
- [ ] Disabled-with-reason buttons are reachable by keyboard and show their tooltip.
- [ ] Reduced motion setting removes movement and transitions.
- [ ] Windows high contrast: buttons keep a visible border and focus.
- [ ] 390 px mobile: primary actions use `lg` (44 px) where they are the main action.

## Not designed yet

- Buttons on dark surfaces (e.g. a pine panel). Use secondary on white until a dark variant exists.
- Split buttons / button with menu. Use a secondary button + a ghost icon button with `aria-haspopup="menu"`.

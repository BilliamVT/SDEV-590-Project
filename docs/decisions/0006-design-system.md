# 0006 – Design system: our own, not Angular Material

- **Status:** Accepted
- **Date:** 2026-11-13
- **Sprint:** 4 (BILLIAMVT-49, visual design pass)

## Context

The app worked but looked like a prototype. A review of the running app at iPhone width (375 px) found:

- **Controls too small:** most buttons and links measured 19–37 px tall: week navigation, Log out, Copy, New code, Join, Pause, Rename, and every text link. Apple's minimum touch target is 44 pt, and the household mostly uses iPhones.
- **Browser-default buttons and inputs:** they look different in Safari (rounded grey pills) and Chrome (small bordered boxes), so what we tested on a laptop wasn't what the household saw.
- **No shared spacing or type scale:** each page had its own values (about 660 lines of component SCSS).
- **Action buttons didn't line up across rows:** one-off items have two buttons where recurring tasks have three, and rows wrapped differently depending on the task name's length.
- **Two kinds of delete confirmation:** the browser's `confirm()` popup in some places, the app's own buttons in others.

The story leaned towards Angular Material and asked for a decision record.

## Options considered

| | A. Our own small design system | B. Angular Material |
|---|---|---|
| What it is | Custom properties (tokens) for colour, spacing, type, radius and touch size, plus shared styles for buttons, fields, notices and cards, in `styles.scss` | Google's component library (`mat-button`, `mat-form-field`, …) with a Material 3 theme |
| Effort for a 5-point story | Small: restyle elements globally, add a few classes; templates and tests barely change | Large: every template and many unit and e2e selectors change; a new theme for light and dark |
| Look on iPhone | Whatever we choose: system font, 44 px targets, iOS-like | Android/Material look; default density gives 40 px buttons |
| Dark mode | Extends the existing theme variables (BILLIAMVT-45) | Needs an M3 theme for both modes |
| Accessibility | Our job: focus rings, contrast, labels; checked by an axe-core e2e test | Largely built in |
| Bundle size | No change | Grows (roughly 100 KB+ for the components used) |
| Lock-in | None: plain CSS | Tied to Material's markup and upgrade cycle |

## Decision

**A. Our own small design system.**

- **Tokens** in `:root`, with dark-mode values: colours (`--color-*`, including `--color-surface`, `--color-primary`, `--color-danger`), spacing (`--space-1` to `--space-6`, 4 px steps), type (`--text-sm` to `--text-2xl`), `--radius` and `--touch: 44px`.
- **Shared element styles:** every `button` (and a link with `class="button"`) is at least 44 px tall, with `primary`, `danger` and `quiet` variants; inputs and selects are 44 px tall; plus `.field`, `.notice`, `.hint`, `.card` and `.actions` classes.
- **Components keep only their layout.**
- **Lists are checklist rows**, after Apple Reminders, Things and Todoist (reviewed with the product owner, Nov 14): a round checkbox marks a task done or undoes it, the name and details sit beside it, and the less common actions (Skip, Delete, Remove; Mark done in the backlog) are under a ⋯ button. Every row is the same height, so a busy day is a few lines taller than an empty one instead of five times taller, and empty days take one short line.
- **Menus float and act directly:** a ⋯ menu is a small popover under its button that closes on a tap elsewhere or Escape. Safe, easily reversed actions (Skip, Back to backlog) happen at once; Delete asks in one plain sentence under the row ("Delete Laundry on Monday, Nov 16? Its other days stay."). Labels have no "…": it's a desktop convention that iPhone apps don't use. Each button's spoken name starts with its visible text, for voice control (WCAG 2.5.3).
- **Accessibility beyond what axe checks** (standards review, Nov 15): every route has a title ("Your tasks – Housework Scheduler"); changes are announced through the shared `Announcer` (a hidden live region); when a focused button disappears, focus goes back to the row's ⋯ or to the nearest heading (`focusLater`); field errors are linked with `aria-invalid` and `aria-describedby`, and a failed submit focuses the first invalid field.
- **Palette: "Teal and sand"** (chosen from three mocked-up options with the product owner, Nov 15): teal is the one signature colour (primary buttons, links, today, the done tick), on warm paper-like backgrounds, with a warm brick red for Overdue and deleting. Chosen over "Indigo and warm stone" (closest to the old look) and "Plum and cool grey" because it suits a home app and doesn't read as a default template. Every pair was checked for WCAG AA before it went in; the values are the tokens at the top of `styles.scss`.
- **Colour means something:** red only for Overdue (a small pill) and the final destructive confirmation; a done circle is green.
- **Confirmations are inline**, in place of the item's buttons, never the browser's `confirm()`.
- **An e2e accessibility test** (`e2e/tests/accessibility.spec.ts`, `@axe-core/playwright`) checks every page in light and dark mode and fails on serious or critical violations. That replaces what Material would have given us for free.

## Consequences

- The app looks the same in Safari and Chrome, and every control is at least 44 px.
- New pages should use the tokens and shared classes, not new values (see the README's front-end section).
- We own accessibility details that a library would handle; the axe test and WCAG AA contrast on every colour pair (light and dark) cover the basics, but it can't judge everything, so trying the app on a phone stays part of reviewing UI changes.
- If the app grows complex widgets (date pickers, dialogs, drag and drop for BILLIAMVT-27), we can adopt individual pieces such as the Angular CDK without moving to Material as a whole.

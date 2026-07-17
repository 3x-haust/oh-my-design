# Master-detail flow

> Candidate hypothesis only. Revalidate its condition, values, and responsive transition
> against the current composition contract; do not transfer this page recipe unchanged.

A list (master) and the selected object's workspace (detail) presented as one continuous
loop: select → inspect → act → return. The composition decision is where the detail
lives — beside the list, over it, or as a separate screen — and that decision is made
from loop frequency and context needs, not from viewport fashion. `core/theory/ux.md`
§Flows: every step that exists only because the layout forced a round-trip is an obstacle.
`core/theory/layout.md` §Density governs the master's row height and scan columns.

## When it earns its place / When it does not

Condition: the primary task is processing or inspecting items from a collection —
tickets, orders, documents, contacts, messages — and the user alternates between
scanning the collection and working on one item many times per session.

Choose the detail presentation by two questions:

1. **Does acting on the item require seeing the list?** (triage, comparison, queue
   awareness) → side-by-side split. The list keeps its scan columns visible; the detail
   never fully covers them.
2. **Is the item work immersive and self-contained?** (long editing, composition) →
   full-screen detail with an explicit return path, or an overlay panel when the visit
   is brief (peek, quick edit).

Condition against: collections the user visits rarely or only reads linearly (an archive,
a blog index) — a plain list with navigation is cheaper. Also against: splitting the
viewport when the detail needs the full width to do its job (a canvas editor) — that is
an app-shell question, not master-detail.

**Anti-overlay clause.** An overlay detail that hides the list's status/assignee columns
while the loop still needs them breaks queue awareness — the failure seen whenever a
"slick" slide-over covers exactly the columns the user was triaging by. If the loop needs
the list, the split is side-by-side and the list keeps `minmax(0, …)` room for its scan
columns.

## Parameters

```css
:root {
  /* Master:detail ratio. 7:5 favors scanning; 5:7 favors item work.
     Choose from the frame's frequent action, then verify at 1280. */
  --md-master-fr: 7fr;
  --md-detail-fr: 5fr;

  /* Minimum master width before the split collapses to stacked navigation.
     Below this the scan columns compress into unreadability. */
  --md-master-min: 480px;

  /* Selected-row marker: structural (inset bar + tint), never tint alone. */
  --md-selected-bg: color-mix(in srgb, var(--accent, #1f6f5c) 8%, transparent);
}
```

## Implementation

```html
<div class="master-detail">
  <section class="md-master" aria-label="목록">
    <!-- Toolbar: search + filters + primary action. Then the collection at
         working density. Selection state is visible and persistent. -->
    <table class="md-table">
      <!-- Scan columns: the nouns the user triages by (status, owner, time).
           The row's open control is a real button/link for keyboard reach. -->
    </table>
  </section>

  <section class="md-detail" aria-label="상세">
    <!-- Item header: title + status control + explicit return path ("목록으로").
         Then the item workspace: content, then the action surface (reply box,
         form) at the end of the loop, sticky on mobile. -->
  </section>
</div>
```

```css
.master-detail {
  display: grid;
  grid-template-columns: minmax(var(--md-master-min), var(--md-master-fr)) minmax(0, var(--md-detail-fr));
  min-height: 0;
}

.md-master { border-right: 1px solid var(--line, #e5e7e5); min-width: 0; }

.md-table tr[aria-selected="true"] {
  background: var(--md-selected-bg);
  box-shadow: inset 3px 0 0 var(--accent, #1f6f5c);
}

.md-detail { min-width: 0; display: flex; flex-direction: column; }
```

The empty-detail state is designed, not blank: when nothing is selected, the detail
region says what selecting does ("왼쪽 목록에서 티켓을 열면 여기에 대화가 보여요") — a
dead pane teaches nothing. Acting in the detail updates the master in place (status
badge, ordering) so the loop's feedback is visible where the next scan happens.

## Responsive behavior

**1280px (desktop):** side-by-side split at the declared ratio. Both regions scroll
independently; the detail's action surface stays reachable without scrolling past the
full conversation when the loop is reply-heavy.

**768px (tablet):** the split usually no longer fits `--md-master-min`; collapse to
stacked navigation — list screen ↔ detail screen — with the selection remembered on
return (scroll position and selected row preserved). An overlay panel is acceptable here
only when the loop does not need the list's columns while acting.

**375px (mobile):** always stacked navigation: full-screen list → full-screen detail
with a visible "목록으로" return in the top zone and the action surface sticky at the
bottom within thumb reach. DOM order stays list-then-detail so focus order and back
navigation match the visual model. At 320px the list rows recompose (title line +
meta line + status mark) instead of compressing table columns.

## Do not combine with

**app-shell-workbench.md side nav at tablet width** — an expanded side nav plus a
side-by-side split leaves the master below its minimum; collapse the nav to the icon
rail before collapsing the split.

**sticky-sidebar-scroll.md** — a sticky editorial sidebar and a master pane are competing
persistent regions with different scroll models; a surface gets one persistent
navigation-like region beside the work, not two.

**Modal dialogs as the default detail** — a modal steals the list, traps scroll, and
forgets position; it is for confirmations and small focused inputs, not for the loop's
main workspace.

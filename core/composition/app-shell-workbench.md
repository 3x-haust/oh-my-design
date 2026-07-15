# App shell workbench

> Candidate hypothesis only. Revalidate its condition, values, and responsive transition
> against the current composition contract; do not transfer this page recipe unchanged.

The default grammar for a `product` work surface: a persistent shell (top bar and/or side
navigation) framing a dominant work region that owns the viewport. The shell answers
"where am I, where else can I go"; the work region carries the task loop. Nothing here is
a scroll narrative — the page does not argue, it operates. `core/theory/ux.md` §Surface
types names the condition; `core/theory/layout.md` §Density governs how loud the data may
be.

## When it earns its place / When it does not

Condition: the frame's `uxSurface` is `product` and the primary screen serves a repeated
task loop over work objects — a queue, a dashboard, a console, an admin table, an editor.
The user returns to this screen many times a day; orientation cost must be near zero and
the frequent action reachable within the first viewport.

The shell earns a side navigation only when the product has 4+ peer destinations the user
switches between; below that, a top bar with inline destinations costs less horizontal
space and leaves more room for the work object (`theory/layout.md`: density follows task
frequency, not furniture convention).

Condition against: a single-surface marketing or editorial page (no destinations to hold),
or a focused flow (checkout, onboarding wizard) where global navigation invites
mid-task escape — use `form-wizard-stepper.md` there. Also against: using the shell as
decoration around content that is itself a landing page; an app shell does not convert a
persuasion page into a product.

**Anti-hero clause.** The work region's first viewport belongs to the work object at
representative data density. A display-scale headline, hero band, marketing gradient, or
illustration claiming that viewport is a grammar defect on this surface — the orientation
line (screen name + one-line state summary, e.g. "받은함 — 대기 12") is the entire
permitted "hero".

## Parameters

```css
:root {
  /* Shell chrome sizes. The top bar stays under 56px so the work region keeps
     the viewport; the side nav collapses to icons at tablet width. */
  --shell-topbar-h: 52px;
  --shell-sidenav-w: 220px;
  --shell-sidenav-w-collapsed: 56px;

  /* Work region density. Row height decides rows-per-viewport: 44-48px serves
     expert repeated scanning; 56px+ serves low-frequency browsing. */
  --work-row-h: 46px;

  /* One accent marks the primary action and the current nav location.
     Chrome stays neutral so data carries the color. */
  --shell-accent: var(--accent, #1f6f5c);
  --shell-chrome-bg: var(--surface, #fff);
  --shell-chrome-line: var(--line, #e5e7e5);
}
```

## Implementation

```html
<!-- The shell is a grid, not a scroll sequence. DOM order: shell nav first
     (it is the product's map), then the work region — focus order follows. -->
<div class="app-shell">
  <header class="shell-topbar">
    <span class="shell-product">제품명</span>
    <p class="shell-orientation">받은함 — 대기 12 · 진행 4</p>
    <nav class="shell-account" aria-label="계정"><!-- profile, settings --></nav>
  </header>

  <nav class="shell-sidenav" aria-label="주 탐색">
    <!-- The user's nouns, current location marked with aria-current. -->
    <a href="/inbox" aria-current="page">받은함</a>
    <a href="/customers">고객</a>
    <a href="/reports">리포트</a>
    <a href="/settings">설정</a>
  </nav>

  <main class="shell-work">
    <!-- The work object owns this region: toolbar (search/filters/primary
         action), then the queue/table/canvas at working density. -->
  </main>
</div>
```

```css
.app-shell {
  display: grid;
  grid-template-columns: var(--shell-sidenav-w) minmax(0, 1fr);
  grid-template-rows: var(--shell-topbar-h) minmax(0, 1fr);
  grid-template-areas:
    "topbar topbar"
    "sidenav work";
  min-height: 100vh;
}

.shell-topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--shell-chrome-bg);
  border-bottom: 1px solid var(--shell-chrome-line);
}

.shell-sidenav {
  grid-area: sidenav;
  border-right: 1px solid var(--shell-chrome-line);
}

.shell-sidenav a[aria-current="page"] {
  color: var(--shell-accent);
  font-weight: 600;
  /* Location is marked structurally (inset bar), not by tint alone. */
  box-shadow: inset 3px 0 0 var(--shell-accent);
}

.shell-work {
  grid-area: work;
  min-width: 0; /* tables and canvases must be allowed to shrink, not overflow */
}
```

The work region's internal order is the task loop: orientation line → locate controls
(search, filters — always visible on an expert surface, never buried in a menu) → the
work object → detail/action surfaces. Reachable states (loading skeleton, empty first-run,
filtered-to-zero, error with recovery) are layouts of this same region, not separate
pages.

## Responsive behavior

**1280px (desktop):** full shell — side nav expanded, work region at working density,
master-detail splits permitted inside the work region (see `master-detail-flow.md`).

**768px (tablet):** the side nav collapses to `--shell-sidenav-w-collapsed` icon rail with
labels on focus/hover; the work region keeps density. Two-region splits inside the work
area become stacked or overlay presentations.

**375px (mobile):** the shell inverts: top bar keeps the orientation line and a menu
disclosure; primary destinations move to a bottom tab bar within thumb reach
(`theory/ux.md` §Navigation — the frequent action must stay in the natural grip zone);
tables recompose to list rows. The frequent action stays within the first viewport —
sticky where the task demands it (e.g. a reply bar). Test 320px reflow: no horizontal
scroll except intentionally two-dimensional data.

```css
@media (max-width: 760px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-areas: "topbar" "work" "tabbar";
  }
  .shell-sidenav { display: none; }
}
```

## Do not combine with

**split-screen-hero.md / typographic-hero.md** — hero grammars claim the first viewport
that belongs to the work object; combining them recreates the landing-page-on-a-tool
defect this recipe exists to prevent.

**bento-grid.md as the work region** — a bento mosaic imposes editorial hierarchy on
peer work objects; a queue or table's hierarchy is in the data (sort order, status),
not in cell sizes. Bento is permitted only for a genuine overview dashboard where
metrics have real priority differences.

**section-inversion.md inside the work region** — alternating section backgrounds is a
scroll-narrative rhythm; a work surface has regions, not narrative sections.

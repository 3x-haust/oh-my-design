# Form wizard stepper

> Candidate hypothesis only. Revalidate its condition, values, and responsive transition
> against the current composition contract; do not transfer this page recipe unchanged.

A focused multi-step flow — onboarding, signup, checkout, complex creation — composed as
one narrow column with a visible progress model, one decision cluster per step, and an
exit from every state. The composition suppresses everything that is not the flow: no
global navigation pulling the user mid-task, no marketing panel repeating the pitch they
already accepted. `core/theory/ux.md` §Forms owns the step-count evidence (Baymard: a
visible progress indicator reduces perceived effort; only the steps the user's task
requires); `core/theory/layout.md` §Forms owns field-row grammar.

## When it earns its place / When it does not

Condition: the task has 8+ fields or genuinely dependent decisions (later fields depend
on earlier answers), or the user's mental load per screen must stay low (first-run
onboarding). Each step is one decision cluster the user can name ("계정", "팀 초대",
"결제") — a step that exists because an engineer needed the data, not because the user
makes a decision there, is merged away.

Condition against: under ~8 independent fields — a single-page form shows the full cost
upfront and is cheaper (`theory/ux.md` §Forms). Also against: pull-based product
onboarding where the product is usable immediately — prefer contextual empty-state
guidance over a forced wizard (§First-run experience: forced tutorials retain worse).

**Anti-trap clause.** Every step has an escape: back to the previous step without data
loss, save-and-exit or an explicit cancel with consequence named. A wizard whose only
exits are "다음" and the browser's back button is a dead end factory. Entered values
survive navigation in both directions and validation failure (value preservation is the
UX acceptance contract, not polish).

## Parameters

```css
:root {
  /* One-column measure. Forms read and complete fastest in a single column
     (theory/layout.md §Forms); 44-52ch keeps labels+inputs scannable. */
  --wizard-measure: 48rem;

  /* Progress model: steps are few, named, and visible. */
  --wizard-step-gap: 8px;
  --wizard-accent: var(--accent, #1f6f5c);

  /* Primary action anchors the step end; back is quiet, never competing. */
  --wizard-cta-h: 48px;
}
```

## Implementation

```html
<main class="wizard">
  <!-- Progress: named steps, current marked, completed steps revisitable. -->
  <nav class="wizard-progress" aria-label="진행 단계">
    <ol>
      <li><a href="#step-account" class="done">계정</a></li>
      <li aria-current="step">팀 초대</li>
      <li>결제</li>
    </ol>
  </nav>

  <form class="wizard-step" aria-labelledby="step-title">
    <h1 id="step-title">팀원을 초대해요</h1>
    <p class="wizard-why">건너뛰어도 돼요 — 나중에 설정에서 초대할 수 있어요.</p>

    <!-- One decision cluster: fields in one column, labels above,
         errors adjacent to their field, values preserved on failure. -->

    <div class="wizard-actions">
      <button type="button" class="wizard-back">이전</button>
      <button type="submit" class="wizard-next">다음: 결제</button>
      <button type="button" class="wizard-skip">건너뛰기</button>
    </div>
  </form>
</main>
```

```css
.wizard {
  max-width: var(--wizard-measure);
  margin-inline: auto;
  padding-inline: 16px;
}

.wizard-progress li[aria-current="step"] { color: var(--wizard-accent); font-weight: 600; }

.wizard-step { display: grid; row-gap: 16px; }

.wizard-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  /* One primary per view: "다음" is filled; back/skip are quiet. */
}

.wizard-next { min-height: var(--wizard-cta-h); }
```

The primary button predicts the next step by name ("다음: 결제" — a CTA predicts what
happens after activation, per the copy-deck protocol). The final step ends on a designed
confirmation that restates what was created and names the first real action in the
product (§Peak-end rule: the end is a deliberate moment, not a redirect).

## Responsive behavior

**1280px (desktop):** the column centers at `--wizard-measure`; surrounding space stays
empty — a wizard earns air (density follows task frequency; this is a low-frequency,
high-attention surface).

**768px (tablet):** identical structure; the progress list may compress to
"2/3 — 팀 초대" numeric form when horizontal room runs out, but the current step stays
named.

**375px (mobile):** actions dock to the bottom within thumb reach; the keyboard must not
cover the focused field or the primary action (test with the on-screen keyboard open —
the bottom-CTA-under-keyboard failure is the classic mobile wizard defect). Back remains
visible without scrolling. At 320px nothing two-dimensional remains.

## Do not combine with

**app-shell-workbench.md global navigation** — a focused flow suppresses global nav;
offering the whole product map mid-checkout invites abandonment and half-created state.
Show at most a logo-exit with a named consequence.

**split-screen-hero.md as a signup decoration panel** — the persuasion already happened;
a marketing half-panel steals half the viewport from the form on every step and doubles
the reflow work at 768px for nothing the task needs.

**Progress bars without step names** — a bare percentage tells the user neither where
they are nor what remains; the anti-pattern version of the visible-progress evidence this
recipe cites.

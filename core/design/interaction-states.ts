import type { Ir, Violation } from '../types.ts';

/**
 * Deterministic interaction-state rules over the IR.
 *
 * ── What the IR can measure ──────────────────────────────────────────────────
 *
 * The DOM IR captures, per node:
 *   - node.name       tagname + first CSS class, e.g. "input.email-field", "div.error-msg"
 *   - node.path       full ancestor path, e.g. "form.contact/div.field/input"
 *   - node.interactive  true for INPUT, SELECT, TEXTAREA, BUTTON, A, SUMMARY, role=button
 *   - node.text       own text content (trimmed, ≤200 chars)
 *
 * It does NOT capture: aria-* attributes, data-* attributes, full class lists
 * beyond the first class, JS event handlers, or CSS :hover/:focus pseudo-classes.
 *
 * ── What becomes a deterministic rule ────────────────────────────────────────
 *
 * DESIGN-FORM-NO-ERROR
 *   When the IR contains at least one form-input node (INPUT/TEXTAREA/SELECT that
 *   is interactive) AND no node on the page carries a class name or text pattern
 *   associated with an error state, the form has no visible error affordance.
 *
 *   Detection signals for error affordance (OR — any one suffices):
 *     - A node whose name contains ".error" or ".invalid" (class name evidence)
 *     - A text node whose text contains "error" / "오류" / "잘못" (copy evidence)
 *
 *   False-positive mitigation: the rule fires only when form inputs are present AND
 *   no error affordance exists at all — not when an affordance exists but looks wrong.
 *   A div.error-state with empty text still counts as present; we are checking
 *   structure, not copy quality.
 *
 * ── What stays prompt-only and why ───────────────────────────────────────────
 *
 * LOADING state
 *   Skeleton, spinner, and shimmer elements are commonly built with libraries
 *   (react-loading-skeleton, Tailwind's animate-pulse) and inlined at runtime.
 *   Static IR captures the resting DOM; any loading overlay is usually hidden
 *   (display:none or opacity:0) and therefore invisible to the IR extractor
 *   (dom.ts skips elements with zero dimensions or display:none). Cannot detect
 *   without runtime JavaScript interaction simulation.
 *   → Covered by hand.agent.yaml and finish-pass.md rules.
 *
 * EMPTY state
 *   Empty states are rendered conditionally by the application — they are absent
 *   from the DOM when there is data. The IR captures the rendered page, which
 *   typically has data. Detecting "this list has an empty state" from the static
 *   DOM would require knowing which lists are data-driven vs. static (nav, footer,
 *   feature-list), which requires full application context.
 *   Furthermore, the false-positive rate would be unacceptably high: every <ul>,
 *   <ol>, and .list container would need to be evaluated, and most would fire on
 *   purely static lists (navigation, feature bullets, footer links).
 *   → Covered by hand.agent.yaml and finish-pass.md rules.
 *
 * SUCCESS state
 *   Success confirmation UIs (toast, inline text, page transition) are triggered
 *   by user actions (form submit, button click) and are absent from the resting DOM.
 *   No IR measurement can confirm they exist without simulating user actions.
 *   → Covered by hand.agent.yaml rules.
 *
 * DISABLED state quality
 *   Detecting whether disabled elements communicate why they are disabled requires
 *   reading the associated explanatory copy and its proximity to the disabled element
 *   — a layout and semantic reasoning task, not a structural one.
 *   The IR does capture `interactive` (which covers BUTTON/INPUT), but the disabled
 *   attribute is not captured, and reasoning about adjacent copy context requires
 *   the full DOM tree with aria relationships, which the IR does not store.
 *   → Covered by hand.agent.yaml rules.
 *
 * OFFLINE state
 *   Offline detection requires a service worker or navigator.onLine event handler.
 *   Neither is visible in the static DOM IR.
 *   → Covered by hand.agent.yaml rules.
 */

// ── DESIGN-FORM-NO-ERROR ─────────────────────────────────────────────────────

/**
 * Returns true when a node is a form-input element that users can type into or
 * select from. Buttons are excluded: they do not receive inline validation.
 */
function isFormInput(name: string, interactive: boolean): boolean {
  if (!interactive) return false;
  return name.startsWith('input') || name.startsWith('textarea') || name.startsWith('select');
}

/**
 * Returns true when a node carries a structural signal that an error state exists:
 *   - Class name contains "error" or "invalid" (structural evidence: the designer
 *     created an error-styled element, even if currently hidden or empty)
 *   - Text content contains common error vocabulary (copy evidence: error message text)
 *
 * This is an OR check — any one signal suffices to suppress the violation.
 */
function hasErrorAffordance(name: string, text: string | undefined): boolean {
  // Class-name evidence: "div.error", "span.invalid", "p.error-message", "input.is-invalid"
  const lower = name.toLowerCase();
  if (
    lower.includes('.error') ||
    lower.includes('.invalid') ||
    lower.includes('error-') ||
    lower.includes('-error') ||
    lower.includes('invalid-') ||
    lower.includes('-invalid')
  ) return true;

  // Text-content evidence: the rendered page shows an error message
  if (text) {
    const t = text.toLowerCase();
    if (
      t.includes('error') ||
      t.includes('오류') ||
      t.includes('잘못') ||
      t.includes('올바르지') ||
      t.includes('invalid') ||
      t.includes('required') ||
      t.includes('필수')
    ) return true;
  }

  return false;
}

/**
 * Run deterministic interaction-state checks over the IR.
 *
 * Currently implements one deterministic rule (DESIGN-FORM-NO-ERROR).
 * All other interaction states are prompt-only; see the file-level comment above.
 *
 * Only call this from `omd check` when the page has interactive elements —
 * it is always safe to call regardless, but pages with no inputs will produce
 * no findings (the form-input guard suppresses the rule).
 */
export function checkInteractionStates(ir: Ir): Violation[] {
  const violations: Violation[] = [];

  // ── DESIGN-FORM-NO-ERROR ──────────────────────────────────────────────────
  //
  // Fires when: at least one form-input node is present AND no node on the page
  // carries an error-state affordance (class or text pattern).
  //
  // The rule fires once at the page level, not once per input — a form design
  // either has error states or it does not. Firing once per input would produce
  // redundant noise on multi-field forms.

  const formInputs = ir.nodes.filter((n) => isFormInput(n.name, n.interactive === true));

  if (formInputs.length > 0) {
    const anyError = ir.nodes.some((n) => hasErrorAffordance(n.name, n.text));

    if (!anyError) {
      // Report against the first input node's path for location context.
      const representative = formInputs[0]!;
      violations.push({
        id: 'DESIGN-FORM-NO-ERROR',
        severity: 'warn',
        layer: 1,
        category: 'system',
        nodeId: representative.id,
        path: representative.path,
        value: `${formInputs.length} form input${formInputs.length === 1 ? '' : 's'}, 0 error affordances`,
        message:
          `This page has ${formInputs.length} form input${formInputs.length === 1 ? '' : 's'} but no visible error-state affordance. `
          + 'Add error-styled elements (class names containing "error" or "invalid") and error message copy. '
          + 'Every field that can fail validation must show what went wrong and what to fix — '
          + 'role=alert on the error container, aria-invalid on the failed field. '
          + 'A form without an error state is an unfinished interface.',
      });
    }
  }

  return violations;
}

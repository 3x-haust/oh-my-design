# Frozen Blind Layout-Composition Rubric v1

The reviewer receives only anonymous fixed-viewport desktop/mobile renders, the generic task
prompt, and applicable probe evidence. Do not reveal system name, model, run, agent, recipe,
references, source code, artifact rationale, or candidate identity. Score each dimension
independently from `0` to `4`; do not change weights or criteria after seeing outputs.

## Scale

- **0 — absent/broken:** the requirement is missing or prevents the task.
- **1 — weak:** visible intent exists but major contradictions or failures dominate.
- **2 — adequate:** functional and understandable, with generic or consequential weaknesses.
- **3 — strong:** deliberate, task-specific, and robust with only minor weaknesses.
- **4 — exceptional:** unusually coherent and specific; desktop/mobile evidence survives
  close scrutiny without material contradiction.

## Eight dimensions

1. **Task/CTA clarity** — entry point, primary action, state feedback, and next step.
2. **Narrative dependency** — prerequisite information appears before dependent decisions;
   sections form a comprehensible sequence rather than interchangeable modules.
3. **Composition rhythm** — changes in interval, scale, and visual mass support the sequence
   without monotony or arbitrary disruption.
4. **Concept-specific form** — structure and media grammar arise from this task/domain rather
   than a generic hero/card/template treatment.
5. **Responsive hierarchy** — mobile deliberately recomposes priority and meaningful order;
   no lost content, accidental crop, or desktop-only dependency.
6. **Type/copy accommodation** — real Korean copy, repeated data, wrapping, hierarchy, and
   CTA labels fit without truncation-driven distortion.
7. **Interaction/form usability risk** — controls, comparison, focus path, error/recovery,
   and reachable states are appropriate to the prompt and supplied probes.
8. **Accessibility/implementation cost** — contrast, focus/order, reflow, target reach, and
   structural complexity show a credible, maintainable implementation path.

Report eight integers, eight one-sentence visible-evidence rationales, and the arithmetic
mean. Do not infer hidden intent or reward prose artifacts.

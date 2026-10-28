# Trusted lifecycle manifest

`omd lifecycle finish --manifest .omd/.cache/trusted-lifecycle-manifest.json --json` runs each script in a fresh
browser against the built entry at desktop and mobile, then measures and reviews the captures. Start from
`omd schema trusted-lifecycle-manifest --json`; it is the field contract.

One script per current task outcome, in canonical order (`mustHave:0`, `mustNotHave:0`, `completionEvidence:0`).
Each script performs real actions and asserts what a visitor would then see.

Choose the assertion by what the action changes:

- `visible-text`: text that appears because of the actions, such as "복사됨" after a copy button or a panel that
  opens. It fails with `required-state-transition-missing` when the text was already visible before the actions.
- `preserved-text`: text that must stay visible through the actions, such as a heading after focusing a link.
- `absent-text`: text that must not be visible, such as an invented claim the outcome forbids.
- `element-state`: `hovered`, `focused`, `focus-visible`, `pressed` or `expanded` on the exact element that receives it.

Text matching ignores spacing and line breaks. `captureState` with `default`, `hover`, `focus`, `pressed` or `open`
needs a final action and an `element-state` assertion on the same selector. Section anchors and static copy are
not state changes: assert them with `preserved-text`, or choose an action whose result is new on screen.
When a run fails, the diagnostic's `findings.repairHints` explains each finding code.

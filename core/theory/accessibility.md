# Accessibility applicability matrix

Use this matrix during design review and again against the working surface. Automated checks can
find missing attributes and some contrast failures. They can't prove reading order, focus movement,
announcements, zoom behavior, or action meaning. Verify those in a real browser.

| Concern | When it applies | How to verify in a real browser | Failure signal |
| --- | --- | --- | --- |
| Accessible name computation | Every interactive control, form field, image action, region that needs a label, and named dialog | Inspect the accessibility tree for computed name and source. Compare it with the visible label. Activate icon-only controls with a screen reader and speech output on. | Name is absent, generic, duplicated in context, taken from placeholder alone, or conflicts with the visible label. An icon's file name becomes the action name. |
| Landmarks and headings | Every page, route, dialog with sections, and repeated navigation region | Inspect landmark roles and names. Navigate by landmarks and headings in a screen reader. Check one main region, labeled repeated navigation, a logical heading outline, and a dialog heading. | Users can't locate main content, two navigation regions have the same unnamed role, heading levels encode visual size rather than structure, or a dialog has no name. |
| Reading order | Any layout where CSS grid, flex order, positioning, columns, cards, overlays, or responsive changes may differ from DOM order | Read with CSS on and navigate in browse mode. Compare spoken sequence with the visual sequence at desktop and narrow widths. Turn CSS off as a diagnostic, not as the pass condition. | Instructions are read after their controls, paired content separates, a modal's background enters the sequence, or responsive visual order contradicts DOM meaning. |
| Focus order and visible focus | Every keyboard-operable page and every tab stop, including controls revealed after interaction | Start at the browser chrome, press Tab and Shift+Tab through 100% of tab stops, then use component-specific arrow keys. Repeat after opening dialogs, menus, disclosures, and errors. Inspect each focused element at 100%, 200%, and 400% zoom. | Any tab stop has no visible focus, focus is clipped or covered, order jumps without task logic, an inactive element receives focus, focus enters inert background, a trap has no exit, or closing a surface loses the trigger. |
| Live regions for async state | Search results, availability checks, save status, uploads, background errors, and updates that don't move focus | With a screen reader running, subscribe before triggering the update. Trigger one success, one empty result, and one failure. Confirm one concise announcement for each settled state. | Nothing is announced, every keystroke is announced, stale results speak after current results, the same status repeats, or focus is stolen to report routine progress. |
| Error association | Every field or group that can become invalid | Submit an empty or invalid form. Inspect `aria-invalid`, description relationships, group naming, summary links, and resulting focus. Correct the field and inspect again. | A red border is the only signal, message isn't named with the field, `aria-describedby` points to a missing node, `aria-invalid` remains after correction, or summary focus and links don't work. |
| Pointer target size | Every pointer target, especially compact controls, icon buttons, table actions, and adjacent links | Measure the CSS pixel target box and spacing in DevTools. Test touch emulation and a real touch device where available. WCAG 2.2 SC 2.5.8 requires at least 24 by 24 CSS px or its spacing exception. Aim for 44 by 44px for touch. | A target is under 24 by 24 CSS px and doesn't meet the spacing exception, adjacent targets overlap the required clearance, or a visually small icon has no larger hit area. |
| Text contrast | All meaningful text, including placeholder text and text in hover, focus, selected, error, and disabled-adjacent states | Use computed foreground and background colors in each state. Verify 4.5:1 for normal text and 3:1 for large text, defined here as at least 24px regular or 18.66px bold. Test over images and gradients at the weakest point. | Any required pair falls below its ratio, a translucent layer changes the real ratio, or text becomes unreadable in a reachable state. |
| Non-text contrast | Control boundaries, focus indicators, state indicators, icons required to operate, and meaningful chart marks | Measure each meaningful graphic against adjacent colors in every state. Verify at least 3:1 where WCAG 1.4.11 applies. Check that shape or text also carries state. | Input boundary, focus ring, selected mark, or required icon is below 3:1, disappears against one adjacent color, or relies on color alone. |
| Reflow | Every web surface except content with an essential two-dimensional layout | At 1280 CSS px viewport width, zoom to 400%, which yields a 320 CSS px content width. Also test a direct 320 CSS px viewport. Pan only in the allowed single direction. | Page-level horizontal scrolling is needed for ordinary content, controls overlap or clip, sticky regions consume the view, text is lost, or reading and focus order break. Data tables may scroll in their bounded region when two-dimensional layout is essential. |
| Text resize | All text and text-like controls | Set browser text size to 200% without relying only on page zoom. Exercise navigation, forms, dialogs, tables, and messages. | Text clips, overlaps, vanishes, requires two-dimensional page scrolling, covers controls, or a fixed-height container hides content. |
| Forced colors | Every custom control, icon, focus indicator, selected state, chart, and status that uses authored color | Enable Windows High Contrast or browser forced-colors emulation. Tab through controls and operate every custom state. Inspect system color substitutions. | Control boundaries, focus, checkmarks, selected state, or required icons disappear. Background images or transparent borders erase meaning. |
| Reduced motion | Any animation, transition, parallax, autoplay, scroll effect, or motion-based status | Enable `prefers-reduced-motion: reduce`, reload, and trigger every motion path. Confirm state changes remain perceivable without travel or flashing. | Essential controls wait for animation, large motion remains, content autoplays, removed animation also removes status, or flashing crosses safety thresholds. |
| RTL direction | Any product that supports Arabic, Hebrew, or another right-to-left locale, plus mixed-script user content | Set document direction to `rtl` with real translated content. Navigate by keyboard and inspect logical spacing, icon meaning, text alignment, numbers, and mixed LTR tokens. | DOM order is manually reversed, Back and Next semantics flip incorrectly, directional icons lie, input caret behavior breaks, or email, phone, and code tokens become unreadable. |
| Cognitive accessibility | Forms, authentication, help, repeated processes, timed tasks, and any flow with memory burden | Complete the same task twice. Check that help stays in the same location, instructions remain available, previously entered data is reused when safe, and time limits can be extended or removed. | Help moves or changes name, users must re-enter known data without a security reason, a timeout causes loss, instructions disappear before use, or recovery demands recall of an error code. |
| Content images | Images that convey facts, identity, mood needed for meaning, charts, diagrams, and screenshots | Inspect the accessibility tree and read the page without seeing the image. Confirm alt text conveys the image's purpose in this context. Provide nearby long description for complex content. | Alt repeats the caption, lists pixels, uses a file name, omits a fact needed for the task, or attempts to encode a complex chart in one vague sentence. |
| Decorative images | Images whose removal changes no information or action | Inspect markup and accessibility tree. Confirm `alt=""` for `<img>` or equivalent exclusion from the tree. Remove the image and check that meaning remains. | Decorative art is announced, empty alt is omitted, or CSS decoration secretly carries required information. |
| Functional images | Images or icons that trigger an action or identify a linked destination | Inspect the enclosing control's computed name, then activate it by keyboard and screen reader. Name the action or destination, not the artwork. | A search button is announced as "magnifying glass", linked logo has no destination name, icon and adjacent text produce a duplicated name, or the image itself becomes a separate tab stop. |

## Browser test setup

Use a production-representative page with real labels and reachable states. Test at least one current
Chromium browser, one browser with a different engine, and the screen reader and browser pairing
supported by the product. Record browser, engine, operating system, assistive technology, viewport,
zoom, text scale, locale, direction, and state.

Keyboard checks cover Tab, Shift+Tab, Enter, Space, Escape, arrow keys, Home, and End where the
component model assigns them. Pointer checks include mouse and touch. Browser emulation is useful
for finding faults, but a touch device and a platform forced-colors mode are stronger evidence.

A pass means the task can be completed and the state can be understood, not merely that an ARIA
attribute exists. Native HTML is the default when it supplies the required role, name, state, and
keyboard behavior.

## Numeric floors

- Visible focus: inspect 100% of reachable tab stops.
- Target size: 24 by 24 CSS px minimum under WCAG 2.2 SC 2.5.8, including its spacing exception.
  Use 44 by 44px as the recommended touch target.
- Contrast: 4.5:1 for normal text, 3:1 for text at least 24px regular or 18.66px bold, and 3:1
  for applicable non-text UI information.
- Reflow: 320 CSS px width, including the equivalent 400% zoom test from a 1280 CSS px viewport.
- Text resize: 200% without loss of content or function.

## Sources

- W3C, Web Content Accessibility Guidelines 2.2
- W3C WAI, ARIA Authoring Practices Guide
- W3C, Accessible Name and Description Computation
- HTML Living Standard
- Apple Human Interface Guidelines and Material Design, touch-target recommendations

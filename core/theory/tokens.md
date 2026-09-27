# Token layers for product interfaces

Tokens turn repeated design decisions into named roles. They don't make an arbitrary value correct. Start with a small system, map every shipped value to a role, and add a token only when a repeated need or state requires it.

## Three layers

### Primitive tokens

Primitives name raw values: neutral colors, brand hues, spacing steps, radii, durations, and shadow recipes. They don't say where a value belongs.

```text
color.neutral.0 = #FFFFFF
color.neutral.900 = #17191C
space.4 = 16px
duration.fast = 120ms
```

### Semantic tokens

Semantic tokens name purpose: `color.text.primary`, `color.surface.raised`, `space.control.inline`, `motion.feedback`. Components consume these by default. Theme and density changes happen here without rewriting each component.

### Component tokens

Component tokens capture a real component exception or anatomy: `button.primary.bg.hover`, `table.row.height.compact`, `dialog.radius`. They should alias semantic tokens unless the component has a proven need. Don't create `card17-border` or mirror every CSS declaration into a token.

The dependency direction is one way:

```text
primitive -> semantic -> component -> rendered property
```

A component token must not become the source for a semantic token. Raw hex values don't belong in component CSS when a committed role exists.

## Color foundations

### Canvas and surfaces

General product UI starts on true white, `#FFFFFF`, unless the user, brand, subject, or an existing system supports another ground. Beige, cream, sepia, and tinted paper aren't neutral premium defaults.

| Role | Starting value | Use |
| --- | --- | --- |
| `color.canvas` | `#FFFFFF` | Main page ground |
| `color.surface.default` | `#FFFFFF` | Controls, panels, and content surfaces on a secondary ground |
| `color.surface.subtle` | `#F7F8FA` | Secondary grouping, table headers, quiet wells |
| `color.surface.raised` | `#FFFFFF` | Floating surfaces with elevation |
| `color.surface.sunken` | `#F1F3F5` | Inset or disabled regions |
| `color.surface.scrim` | `rgba(16, 18, 20, 0.56)` | Modal separation |

Near-white neutrals belong on secondary surfaces, not as an automatic whole-page wash. If canvas and surface are both white, use spacing, elevation, or one meaningful border to show the relationship.

### Neutral ramp

A neutral ramp needs enough lightness separation for surfaces, borders, icons, and text. This sample is a cool true-neutral starting point, not a brand prescription.

| Token | Value |
| --- | --- |
| `neutral.0` | `#FFFFFF` |
| `neutral.50` | `#F7F8FA` |
| `neutral.100` | `#F1F3F5` |
| `neutral.200` | `#E3E6EA` |
| `neutral.300` | `#CFD4DA` |
| `neutral.400` | `#AEB5BE` |
| `neutral.500` | `#858E99` |
| `neutral.600` | `#626B76` |
| `neutral.700` | `#454C55` |
| `neutral.800` | `#2B3036` |
| `neutral.900` | `#17191C` |

Validate computed pairs. A ramp is not accessible merely because its endpoints differ.

### Text levels

| Role | Typical mapping on white | Contrast target |
| --- | --- | --- |
| `color.text.primary` | `neutral.900` | At least 7:1 when practical, never below applicable WCAG AA |
| `color.text.secondary` | `neutral.700` | At least 4.5:1 for ordinary text |
| `color.text.tertiary` | `neutral.600` | At least 4.5:1 when it carries information |
| `color.text.disabled` | `neutral.500` | Disabled controls may fall under a WCAG contrast exception, but text must remain legible and state must not rely on low contrast alone |
| `color.text.inverse` | `neutral.0` | Validate against every inverse surface and state |
| `color.icon.default` | `neutral.700` | 3:1 when needed to identify a control or state |

Tertiary doesn't mean tiny. Don't combine 12px type, low contrast, and thin weight to make metadata disappear.

### Border roles

| Role | Use |
| --- | --- |
| `color.border.subtle` | Optional separators inside dense structures |
| `color.border.default` | Input and component boundary |
| `color.border.strong` | Selected, emphasized, or high-contrast boundary |
| `color.border.inverse` | Boundary on dark or saturated surfaces |

Don't draw a one-pixel box around every row, card, cell, and section. Hairline-grid overuse creates false structure and visual noise. Prefer spacing and alignment for grouping, row dividers only where scanning needs them, and full borders for interactive boundaries.

### Accent, action, focus, and selection

Keep brand expression separate from action semantics when one hue can't safely do both.

* `color.accent`: restrained brand emphasis, not every decoration.
* `color.action.primary.bg`, `.fg`, `.hover`, `.active`, `.disabled`: primary action pairs.
* `color.action.secondary.*`: secondary action pairs.
* `color.focus.ring`: visible against canvas, surfaces, and action fills. Use at least a 2px ring or an equally visible outline treatment, with 3:1 non-text contrast where applicable.
* `color.selection.bg`, `.fg`, `.border`: selected rows, chips, and text selection. Selection needs more than color when the context is ambiguous.

Never reuse accent as success merely because it is green, or error merely because it is red.

### Semantic status families

Each status needs background, foreground, border, icon, and interactive variants when actions appear inside it.

| Family | Background | Foreground | Border | Job |
| --- | --- | --- | --- | --- |
| Success | `success.bg` | `success.fg` | `success.border` | Verified successful state |
| Warning | `warning.bg` | `warning.fg` | `warning.border` | Risk or condition requiring attention |
| Error | `error.bg` | `error.fg` | `error.border` | Failure, invalid input, destructive consequence |
| Info | `info.bg` | `info.fg` | `info.border` | Neutral system information |

A pale status background doesn't authorize colored body text with poor contrast. Validate foreground on background, border against adjacent surface, icon against background, and any link in resting, hover, focus, visited, and disabled states.

## Elevation and radius

### Elevation

| Token | Treatment | Use |
| --- | --- | --- |
| `elevation.0` | none | In-flow content |
| `elevation.1` | `0 1px 2px rgba(16,18,20,.08)` | Raised control or quiet sticky region |
| `elevation.2` | `0 4px 12px rgba(16,18,20,.12)` | Menu, popover, floating panel |
| `elevation.3` | `0 12px 32px rgba(16,18,20,.18)` | Dialog or rare high overlay |

Elevation expresses stacking, not prestige. Don't put a shadow on every card. Dark mode needs separately tested values and may rely more on surface lightness and borders.

### Radius

| Token | Value | Use |
| --- | --- | --- |
| `radius.0` | `0` | Tables, attached groups, sharp brand systems |
| `radius.1` | `4px` | Small controls and tags |
| `radius.2` | `8px` | Inputs, buttons, compact panels |
| `radius.3` | `12px` | Dialogs and larger contained surfaces |
| `radius.4` | `16px` | Rare large media or brand-led containers |
| `radius.full` | `9999px` | Pills, avatars, circular controls |

Use fewer radii than available. Repeated rounded cards aren't a substitute for hierarchy.

## Spacing

Use a 4px base scale:

| Token | Value |
| --- | --- |
| `space.0` | `0` |
| `space.1` | `4px` |
| `space.2` | `8px` |
| `space.3` | `12px` |
| `space.4` | `16px` |
| `space.5` | `20px` |
| `space.6` | `24px` |
| `space.8` | `32px` |
| `space.10` | `40px` |
| `space.12` | `48px` |
| `space.16` | `64px` |
| `space.20` | `80px` |

Semantic aliases include `space.control.inline`, `space.control.block`, `space.group`, `space.section`, and `space.page.gutter`. Density modes remap those aliases, not the primitive scale.

Optical exceptions are allowed when geometry causes a visible mismatch: a play icon may shift 1px inside a circle, an uppercase badge may need 1px more top padding, and a one-pixel border changes the apparent inset. Record the exception beside the component token. Don't invent one-off 17px gaps because the scale wasn't consulted.

## Motion

| Role | Duration | Easing | Example |
| --- | --- | --- | --- |
| Instant feedback | 80 to 120ms | `cubic-bezier(.2, 0, 0, 1)` | Press, toggle thumb, color response |
| Small transition | 120 to 180ms | `cubic-bezier(.2, 0, 0, 1)` | Tooltip, menu fade, compact expand |
| Standard transition | 180 to 240ms | `cubic-bezier(.2, 0, 0, 1)` | Drawer, panel state change |
| Enter | 200 to 300ms | `cubic-bezier(0, 0, 0, 1)` | Dialog or substantial overlay entrance |
| Exit | 140 to 220ms | `cubic-bezier(.4, 0, 1, 1)` | Overlay departure |
| Emphasis | 300 to 450ms | Project-specific | Rare onboarding or confirmed state change |

Use transform and opacity when they preserve layout and meaning. Motion duration follows distance, mass, and task interruption, not a universal 1500ms flourish. Define `motion.reduced.duration: 0ms` or a short crossfade and remove nonessential travel under `prefers-reduced-motion`.

## Z-index

Use named bands, not escalating guesses:

| Token | Value | Layer |
| --- | --- | --- |
| `z.base` | `0` | Document |
| `z.sticky` | `100` | Sticky header or column |
| `z.dropdown` | `300` | Menus and popovers |
| `z.overlay` | `500` | Scrim |
| `z.modal` | `600` | Dialog |
| `z.toast` | `700` | Time-bound feedback |
| `z.tooltip` | `800` | Tooltip above controls |

Keep local stacking contexts local. A component shouldn't request `999999` to escape a broken parent context.

## Density modes

Support density through semantic component dimensions.

| Role | Compact | Comfortable |
| --- | --- | --- |
| Control height | 32px | 40px |
| Table row | 36px | 48px |
| Control inline padding | 10px | 14px |
| Control gap | 6px | 8px |
| Body type | 14 to 15px | 15 to 16px |

Compact mode is for pointer-led expert work. Touch targets still need an adequate activation area, commonly 44 by 44 CSS px, even if the visual control is smaller. Don't shrink fonts below 12px or remove focus treatment to gain density.

## Breakpoints

Breakpoints mark content failure, not device brands. A starter set may be:

```text
breakpoint.sm = 480px
breakpoint.md = 768px
breakpoint.lg = 1024px
breakpoint.xl = 1280px
```

Change or add one when a navigation label wraps, a comparison loses context, a readable measure grows too wide, or controls no longer fit. Test between named values and at 320 CSS px. Container queries can own component-level transitions while viewport breakpoints own page composition.

## 60-30-10 without cargo culting

60-30-10 is an area heuristic for dominant, secondary, and accent roles. It can expose an accent spread across too much of a marketing composition. It is not a law, acceptance score, or product-UI quota. Status colors appear when their states exist. A selected row doesn't need ten percent of the screen, and a monochrome or image-led composition may not resemble the ratio at all.

## JSON example

```json
{
  "$schema": "https://tr.designtokens.org/format/",
  "primitive": {
    "color": {
      "white": { "$type": "color", "$value": "#FFFFFF" },
      "neutral-100": { "$type": "color", "$value": "#F1F3F5" },
      "neutral-700": { "$type": "color", "$value": "#454C55" },
      "neutral-900": { "$type": "color", "$value": "#17191C" },
      "blue-600": { "$type": "color", "$value": "#2457D6" }
    },
    "space": {
      "2": { "$type": "dimension", "$value": "8px" },
      "4": { "$type": "dimension", "$value": "16px" }
    }
  },
  "semantic": {
    "color": {
      "canvas": { "$type": "color", "$value": "{primitive.color.white}" },
      "text-primary": { "$type": "color", "$value": "{primitive.color.neutral-900}" },
      "text-secondary": { "$type": "color", "$value": "{primitive.color.neutral-700}" },
      "action-bg": { "$type": "color", "$value": "{primitive.color.blue-600}" },
      "action-fg": { "$type": "color", "$value": "{primitive.color.white}" }
    },
    "space": {
      "control-inline": { "$type": "dimension", "$value": "{primitive.space.4}" }
    }
  },
  "component": {
    "button-primary": {
      "background": { "$type": "color", "$value": "{semantic.color.action-bg}" },
      "foreground": { "$type": "color", "$value": "{semantic.color.action-fg}" },
      "padding-inline": { "$type": "dimension", "$value": "{semantic.space.control-inline}" }
    }
  }
}
```

## Validate state-pair completeness

Inventory components against states before checking individual colors. For every interactive component, list `rest`, `hover`, `active`, `focus-visible`, `selected` where applicable, `disabled`, `loading`, `invalid`, and theme variants that can actually occur.

Then validate pairs, not isolated swatches:

1. Foreground against background for every state.
2. Border or focus ring against the adjacent surface.
3. Icon against its component background.
4. State against neighboring states without relying on hue alone.
5. Action text or link inside every status background.
6. Light and dark mappings for the same semantic role.
7. Forced-colors behavior and visible focus.

A simple completeness record can use rows such as:

| Component | State | BG | FG | Border | Focus | Contrast checked | Redundant cue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Primary button | rest | yes | yes | N/A | N/A | yes | label and shape |
| Primary button | focus-visible | yes | yes | yes | yes | yes | outline |
| Text input | invalid | yes | yes | yes | yes | yes | message and icon |

Fail the system when a reachable state has a missing role, aliases an unrelated semantic color, loses visible focus, or passes only on the canvas but not on the surface where it ships.

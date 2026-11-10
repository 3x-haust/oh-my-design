# The material stage

`omd studio rig [--out src/stage]` writes `materialStage.ts` into the project: a three.js stage (MIT) that
turns an SVG path into a lit object. It exists because lighting a convincing object by hand takes many
rounds; the stage starts from a tuned result, so the work goes into the shape and what it does.

```ts
import { createMaterialStage } from './stage/materialStage';

const stage = createMaterialStage(canvas, {
  shapes: [{ path: MARK_PATH }],            // the real mark's path data, or the object the idea names
  paper: '#f6f5f2',                         // the page background: rendered exactly, so the canvas has no edge
  color: '#ff5a1f',                         // the brand colour, sampled from the project's material
  material: 'glass',                        // 'glass' | 'clay' | 'porcelain' | 'ink-metal'
  entrance: 'rise', idle: 'float',          // or 'drop' / 'none', 'turn' / 'none'
  offset: { wide: [0.18, 0], tall: [0, -0.12] }, // where it sits beside the type, desktop and phone
  onFrame: ({ t, objects }) => { /* your choreography, seconds since arrival */ },
});
// in React: create in useEffect, return () => stage.dispose()
```

What is already handled: a photographer's studio as the environment (softbox, rim strips, warm bounce),
neutral tone mapping with the paper colour pre-inverted so it matches the page exactly, soft shadows on the
paper, bloom whose threshold sits above the paper so only highlights glow, rounded bevels that catch light,
a spring entrance with stagger, a quiet idle, pointer parallax, a phone framing, pausing off-screen, and one
still frame at rest under `prefers-reduced-motion`. `?t=1.2` holds the stage at that second.

Craft notes:
- Several shapes make a scene: give each a `position` (z is distance from the paper) and its own material.
- Glass reads by depth of colour and needs thickness: use a `depth` of 0.3 or more. Ink-metal reads by
  reflection: give it curves. Clay and porcelain carry flat brand colour best.
- The object must do something that argues the page's claim; an object that only floats is decoration.
  Put that in `onFrame`, and bring a part of the object back in later sections (a second smaller stage, or a
  still crop).
- Put the canvas inside the `data-product` element, at least half the first screen wide. The stage writes
  its clock to `--stage-t` on the canvas, so CSS and type can keep time with it.
- three is not a default dependency: load the stage with a dynamic `import()` after first paint, and keep
  real text in the DOM beside it.

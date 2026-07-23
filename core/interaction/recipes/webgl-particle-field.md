# WebGL particle field (GPU points system, optionally pointer-reactive)

A field of thousands of GPU-drawn points drifts, forms a shape, or parts around the pointer —
a constellation, a data cloud, a dissolving/coalescing wordmark. Points are drawn with
`gl.POINTS` (or an instanced quad), positioned and moved on the GPU, so tens of thousands of them
cost a single draw call. It is the WebGL escalation of a static SVG dot system. Built on
`webgl-scene-scaffold.md`; do not ship it without that envelope.

## When it earns its place / When it does not

Condition: a `showpiece` surface whose concept is emergence, data, network, or dissolution — the
particles ARE the metaphor (a data platform's points coalescing into a chart, a launch page's
logo forming from a cloud), not decorative sparkle. One signature moment per surface: a particle
field claims the one-signature-moment allowance and must not stack with another (parallax,
magnetic hover, signature lighting).

Condition against: sparkle-for-atmosphere with no conceptual tie (that is ornament — the visual
counterpart of the geometric-glyph slop); dense content surfaces; `product`/quiet; anything a
static SVG dot pattern or a CSS recipe already carries; a factual carrier.

## Gate

Ships only on the `webgl-scene-scaffold.md` gate: hand precedence (the particle metaphor is the
product's own mechanism, or an explicit request), a declared performance budget (particle count
is the dominant cost lever — declare a cap), and a non-canvas semantic fallback.

## Parameters

```js
const FIELD = {
  count: 6000,        // start low; the budget, not the GPU ceiling, sets this. Degrade before dropping fps.
  pointSize: 2.0,     // device-independent; multiplied by dpr in the shader
  drift: 0.04,        // ambient motion rate when idle
  pointerRadius: 0.12, // fraction of viewport the pointer displaces; 0 disables pointer reactivity
  pointerStrength: 0.6,
};
```

## Implementation

Positions live in a GPU buffer. The vertex shader moves each point from its home position by an
ambient drift plus a pointer-displacement term; the fragment shader draws a soft round point.
Motion is computed on the GPU from `u_time` and a `u_pointer` uniform — the CPU only updates two
uniforms per frame, never the buffer.

```glsl
// vertex.glsl
attribute vec2 a_home;      // rest position, uploaded once
uniform float u_time; uniform vec2 u_pointer; uniform float u_dpr;
uniform float u_drift, u_pRadius, u_pStrength, u_pointSize;
void main(){
  vec2 p = a_home;
  p += 0.01 * u_drift * vec2(sin(u_time + a_home.y * 8.0), cos(u_time + a_home.x * 8.0)); // ambient
  vec2 d = p - u_pointer; float dist = length(d);                 // pointer parts the field
  if (u_pRadius > 0.0 && dist < u_pRadius) p += normalize(d) * (u_pRadius - dist) * u_pStrength;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = u_pointSize * u_dpr;
}
```

```js
import { mountWebglScene } from './webgl-scene-scaffold.js';

mountWebglScene(section, (canvas, budget) => {
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const program = buildProgram(gl, VERT_PARTICLES, FRAG_SOFT_POINT);
  const homes = seedPositions(FIELD.count);         // Float32Array of rest positions (a shape or noise)
  const buf = uploadStatic(gl, homes);              // uploaded ONCE, never per frame
  const u = getUniforms(gl, program, ['u_time','u_pointer','u_dpr','u_drift','u_pRadius','u_pStrength','u_pointSize']);
  let pointer = [-1, -1];
  const onMove = (e) => { const r = canvas.getBoundingClientRect();
    pointer = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
  if (window.matchMedia('(pointer: fine)').matches && FIELD.pointerRadius > 0)
    section.addEventListener('pointermove', onMove, { passive: true });
  return {
    render(tMs){
      gl.uniform1f(u.u_time, tMs / 1000); gl.uniform2f(u.u_pointer, pointer[0], pointer[1]);
      gl.drawArrays(gl.POINTS, 0, FIELD.count);      // one draw call for the whole field
    },
    resize(w, h, dpr){ gl.viewport(0,0, w*dpr, h*dpr); gl.uniform1f(u.u_dpr, dpr); },
    dispose(){ section.removeEventListener('pointermove', onMove); gl.deleteBuffer(buf); gl.deleteProgram(program); },
  };
});
```

## Non-canvas fallback

The fallback is the real content plus, where the field carried meaning (a formed wordmark or a
chart shape), a static representation of that end state — an inline SVG of the coalesced shape or
a real image — not an empty region. Delete the canvas: the surface still shows what the particles
were forming, statically. Points are decoration over real, selectable DOM; they never encode text
or a control.

## Reduced-motion variant

Under `prefers-reduced-motion: reduce`, render the field once in its rest/formed state and stop —
no drift, no pointer reactivity — or skip the canvas and show the static SVG end state. Ambient
drift and pointer displacement are both motion a reduced-motion user opted out of; the settled
shape is the accessible equivalent.

## Performance note

Particle count is the dominant cost and the primary degrade lever — halve it before dropping
frames, and never exceed the declared budget's cap. Positions are uploaded once and moved on the
GPU; the CPU updates only `u_time` and `u_pointer` per frame, so the whole field is one draw call.
`gl.POINTS` avoids per-particle geometry. Cap `maxDpr` (points scale with dpr). Lazy-init and
teardown come from the scaffold; a particle field must never run off-screen or before the surface
is near the viewport.

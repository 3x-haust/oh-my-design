# Shader gradient field (animated fragment-shader mesh background)

A fragment shader paints a slow, organic colour field — flowing gradient mesh, noise-warped
bands, an aurora — across a full-bleed background. It is the WebGL escalation of the CSS
gradient-mesh placeholder: where a CSS `conic`/`radial` gradient is static and banded, a shader
evaluates colour per pixel per frame from a noise function, so the field drifts continuously
without tiling artefacts. Built on `webgl-scene-scaffold.md`; do not ship it without that
envelope.

## When it earns its place / When it does not

Condition: a `showpiece` hero or section whose concept is atmospheric, generative, or fluid
(a launch page, a brand microsite, a "living system" narrative spine per `theory/imagegen.md`),
where the colour field IS the art direction and a static gradient reads as flat next to it. The
palette is the surface's committed colour identity (`human-design-loop.md` colour commitment) fed
into the shader as uniforms — never a default rainbow.

Condition against: any surface carrying real content density or a factual carrier behind the
field; a `product`/quiet surface; a page where the CSS gradient-mesh recipe already looks
finished; a palette that is not committed (a colourless page does not become one by animating its
greys — see `SLOP-COLORLESS`).

## Gate

Ships only on the `webgl-scene-scaffold.md` gate: hand precedence (explicit request or a genuinely
generative concept), a declared performance budget, and a non-canvas semantic fallback. A shader
field that is pure decoration behind text almost never clears hand precedence on its own — it
usually rides an explicit "make the hero feel alive" brief.

## Parameters

```glsl
// Uniforms driven from JS. Colours are the surface's committed identity, not defaults.
uniform vec3  u_colorA;   // dominant ground
uniform vec3  u_colorB;   // secondary
uniform vec3  u_accent;   // the reserved ~10% accent, used sparingly in the mix
uniform float u_speed;    // 0.02–0.08: drift rate. Slow. A fast field reads as a screensaver.
uniform float u_scale;    // 1.5–3.0: noise frequency. Lower = broader, calmer bands.
uniform vec2  u_res;      // canvas resolution
uniform float u_time;     // seconds
```

## Implementation

The mesh is a single full-screen triangle; all the work is in the fragment shader. Animate
`u_time` only — never resize or re-upload geometry per frame (that would touch layout and defeat
the point of running on the GPU). Keep the shader cheap: 2–3 octaves of value noise, not a
full fractal Brownian tower.

```glsl
// fragment.glsl — value-noise gradient field (2 octaves, cheap)
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float t = u_time * u_speed;
  float n = noise(uv * u_scale + t) * 0.6 + noise(uv * u_scale * 2.0 - t) * 0.4;
  vec3 base = mix(u_colorA, u_colorB, smoothstep(0.2, 0.8, n));
  vec3 col  = mix(base, u_accent, smoothstep(0.85, 1.0, n)); // accent only at the field's peaks
  gl_FragColor = vec4(col, 1.0);
}
```

```js
import { mountWebglScene, SCENE_BUDGET } from './webgl-scene-scaffold.js';

mountWebglScene(section, (canvas) => {
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const program = buildProgram(gl, VERT_FULLSCREEN_TRI, FRAG_GRADIENT_FIELD); // compile once
  const u = getUniforms(gl, program, ['u_colorA','u_colorB','u_accent','u_speed','u_scale','u_res','u_time']);
  setPalette(gl, u, readBrandTokens());        // committed identity, not a default
  return {
    render(tMs){ gl.uniform1f(u.u_time, tMs / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3); },
    resize(w, h, dpr){ gl.viewport(0,0, w*dpr, h*dpr); gl.uniform2f(u.u_res, w*dpr, h*dpr); },
    dispose(){ gl.deleteProgram(program); },
  };
});
```

## Non-canvas fallback

The fallback is the CSS gradient-mesh from `graphics/` (a layered `radial`/`conic-gradient` using
the same committed palette), rendered as the section's static background. It ships in the CSS
always; the shader canvas layers on top only when the gate and support allow. Delete the canvas:
the section still has its committed colour field, just static. Real content sits above both,
untouched.

```css
.scene { background: /* the same palette as a static layered gradient */
  radial-gradient(120% 120% at 20% 10%, var(--color-a), transparent 60%),
  radial-gradient(120% 120% at 80% 90%, var(--color-b), transparent 60%),
  var(--color-a);
}
```

## Reduced-motion variant

Under `prefers-reduced-motion: reduce`, do not run the loop. Either render one settled shader
frame (a still generative field is lawful and still richer than a CSS gradient) or skip the
canvas entirely and keep the static gradient fallback. Never leave `u_time` advancing.

## Performance note

One full-screen triangle, one cheap fragment shader, one uniform update per frame — no geometry
re-upload, no layout, no main-thread pixel work. Cap `maxDpr` from the scaffold: a fragment shader
runs once per output pixel, so a 3x buffer triples cost for no visible gain on a soft gradient.
Keep the noise to 2–3 octaves; each octave is another set of texture-free ALU ops across every
pixel every frame. Budget the shader-program compile (a one-time cost) and the continuous GPU
draw against the declared performance budget.

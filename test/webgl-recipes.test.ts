import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipesDir = join(root, 'core', 'interaction', 'recipes');

// The WebGL/shader escalation pack. Every file must carry the same safety envelope, because a
// canvas is the highest-cost, least-accessible carrier OMD can ship.
const WEBGL_RECIPES = ['webgl-scene-scaffold', 'shader-gradient-field', 'webgl-particle-field'];

const REQUIRED_HEADINGS = [
  '## When it earns its place / When it does not',
  '## Gate',
  '## Parameters',
  '## Implementation',
  '## Non-canvas fallback',
  '## Reduced-motion variant',
  '## Performance note',
];

for (const name of WEBGL_RECIPES) {
  const file = join(recipesDir, `${name}.md`);

  test(`${name}.md exists`, () => {
    assert.ok(existsSync(file), `${name}.md not found at ${file}`);
  });

  test(`${name}.md carries every required safety heading`, () => {
    const content = readFileSync(file, 'utf8');
    for (const heading of REQUIRED_HEADINGS) {
      assert.ok(content.includes(heading), `${name}.md: missing heading "${heading}"`);
    }
  });

  test(`${name}.md gates on hand precedence, a performance budget, and a non-canvas fallback`, () => {
    const content = readFileSync(file, 'utf8');
    assert.match(content, /hand precedence/i, `${name}.md must name hand precedence`);
    assert.match(content, /performance budget/i, `${name}.md must name a declared performance budget`);
    assert.match(content, /non-canvas semantic fallback/i, `${name}.md must name a non-canvas semantic fallback`);
  });

  test(`${name}.md honours prefers-reduced-motion with a static settled state`, () => {
    const content = readFileSync(file, 'utf8');
    assert.match(content, /prefers-reduced-motion/, `${name}.md must reference prefers-reduced-motion`);
    const reduced = /## Reduced-motion variant([\s\S]*?)(?=\n## |$)/.exec(content);
    assert.ok(reduced, `${name}.md missing Reduced-motion variant body`);
    assert.match(reduced![1]!, /settled|static|stop|skip/i, `${name}.md reduced-motion must settle/stop/skip, not run`);
  });
}

// The scaffold is the mandatory envelope: lazy init, DPR cap, teardown, context-loss recovery.
test('webgl-scene-scaffold.md codifies lazy init, a DPR cap, teardown, and context-loss recovery', () => {
  const content = readFileSync(join(recipesDir, 'webgl-scene-scaffold.md'), 'utf8');
  assert.match(content, /IntersectionObserver/, 'scaffold must lazy-init via IntersectionObserver');
  assert.match(content, /maxDpr|devicePixelRatio/, 'scaffold must cap the device pixel ratio');
  assert.match(content, /webglcontextlost/, 'scaffold must handle WebGL context loss');
  assert.match(content, /dispose\(\)|teardown|disconnect/, 'scaffold must tear the renderer down on exit');
});

// The pack lives in interaction/recipes and must not disturb the locked motion cookbook count.
test('the WebGL pack does not disturb the 12 CSS motion recipes', () => {
  const motion = readdirSync(join(root, 'core', 'motion', 'recipes')).filter((f) => f.endsWith('.md'));
  assert.equal(motion.length, 12, `expected motion recipes to remain 12, found ${motion.length}`);
});
test('expressive.md points at the WebGL escalation pack so it is discoverable at the showpiece ceiling', () => {
  const expressive = readFileSync(join(root, 'core', 'theory', 'expressive.md'), 'utf8');
  assert.match(expressive, /webgl-scene-scaffold\.md/);
  assert.match(expressive, /shader-gradient-field\.md/);
  assert.match(expressive, /webgl-particle-field\.md/);
});
test('the hand builds an authorized WebGL escalation against the recipe scaffold', () => {
  const hand = readFileSync(join(root, 'src', 'agents', 'hand.agent.yaml'), 'utf8').replace(/\s+/g, ' ');
  assert.match(hand, /build it against the `core\/interaction\/recipes\/webgl-\*` pack/i);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecipe, RecipeParseError } from '../core/recipe/parse.ts';
import { materializeRecipe, MaterializeError } from '../core/recipe/materialize.ts';
import { installRecipe, listRecipes, loadRecipe, RecipeNotFoundError } from '../core/recipe/store.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const PACK = fileURLToPath(new URL('../core/', import.meta.url));

test('parseRecipe extracts fences by section and collects bare deps', () => {
  const recipe = loadRecipe(PACK, 'scroll-reveal');
  assert.equal(recipe.family, 'motion');
  assert.equal(recipe.title, 'Scroll reveal');
  assert.ok(recipe.fences.length >= 4, `expected several fences, got ${recipe.fences.length}`);
  assert.ok(recipe.fences.some((f) => f.lang === 'css' && f.section === 'Parameters'));
  assert.ok(recipe.fences.some((f) => f.lang === 'tsx' && f.section === 'React'));
  assert.deepEqual([...recipe.deps], ['framer-motion', 'react']);
});

test('parseRecipe rejects empty, titleless, codeless, and unterminated documents', () => {
  assert.throws(() => parseRecipe('', 'x', 'motion'), RecipeParseError);
  assert.throws(() => parseRecipe('## Only a section\n\n```css\na{}\n```\n', 'x', 'motion'), /no title/);
  assert.throws(() => parseRecipe('# Title\n\nprose only\n', 'x', 'motion'), /no code to install/);
  assert.throws(() => parseRecipe('# Title\n\n```css\na{}\n', 'x', 'motion'), /unterminated/);
});

test('materializeRecipe emits real CSS carrying the parameters and the reduced-motion branch', () => {
  const result = materializeRecipe(loadRecipe(PACK, 'scroll-reveal'), { stack: 'vanilla' });
  const css = result.files.find((f) => f.path === 'scroll-reveal.css');
  assert.ok(css, 'css file must be emitted');
  assert.match(css.contents, /--reveal-y:/);
  assert.match(css.contents, /@keyframes reveal-up/);
  assert.match(css.contents, /animation-timeline: view\(\)/);
  assert.match(css.contents, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css.contents, /omd recipe add scroll-reveal/);
});

test('vanilla emits JS and drops React-only dependencies; react emits the component', () => {
  const vanilla = materializeRecipe(loadRecipe(PACK, 'scroll-reveal'), { stack: 'vanilla' });
  assert.ok(vanilla.files.some((f) => f.path === 'scroll-reveal.js'));
  assert.ok(!vanilla.files.some((f) => f.path.endsWith('.tsx')));
  assert.deepEqual([...vanilla.deps], [], 'a framework-free install must not demand react packages');

  const react = materializeRecipe(loadRecipe(PACK, 'scroll-reveal'), { stack: 'react' });
  const tsx = react.files.find((f) => f.path === 'scroll-reveal.tsx');
  assert.ok(tsx, 'tsx file must be emitted');
  assert.match(tsx.contents, /from 'framer-motion'/);
  assert.ok(react.deps.includes('framer-motion'));
});

test('every shipped recipe parses and materializes on at least one stack', () => {
  const refs = listRecipes(PACK);
  assert.ok(refs.length >= 28, `expected the full recipe library, got ${refs.length}`);
  for (const ref of refs) {
    const recipe = loadRecipe(PACK, ref.name);
    const emitted = (['vanilla', 'react'] as const).some((stack) => {
      try {
        return materializeRecipe(recipe, { stack }).files.length > 0;
      } catch {
        return false;
      }
    });
    assert.ok(emitted, `${ref.name} produced no installable file on any stack`);
  }
});

test('a recipe with no installable code on a stack raises rather than emitting an empty install', () => {
  const reactOnly = parseRecipe('# Only React\n\n## React\n\n```tsx\nexport const A = () => null;\n```\n', 'react-only', 'motion');
  assert.throws(() => materializeRecipe(reactOnly, { stack: 'vanilla' }), MaterializeError);
});

test('installRecipe writes the files to disk and reports what landed', () => {
  const out = mkdtempSync(join(tmpdir(), 'omd-recipe-'));
  const result = installRecipe(PACK, 'scroll-reveal', {
    stack: 'vanilla',
    outDir: out,
    writer: createTestProjectWriteAdapter(out),
  });
  assert.equal(result.written.length, result.files.length);
  for (const path of result.written) {
    assert.ok(readFileSync(path, 'utf8').length > 0, `${path} must not be empty`);
  }
  assert.throws(() => installRecipe(PACK, 'no-such-recipe', {
    stack: 'vanilla',
    outDir: out,
    writer: createTestProjectWriteAdapter(out),
  }), RecipeNotFoundError);
  assert.throws(() => installRecipe(PACK, 'scroll-reveal', {
    stack: 'vanilla',
    outDir: join(out, '..', 'recipe-escape'),
    writer: createTestProjectWriteAdapter(out),
  }), /guarded project root/);
});

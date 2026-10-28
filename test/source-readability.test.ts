import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { crowdedComponentFiles, missingBehaviorTests, requireReadableSource, requireReviewableSource, unreadableSources } from '../core/design/source-readability.ts';

test('packed hand-authored source is refused; formatted source, generated output and copied assets are not', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-readable-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const route = { allowedPaths: ['src/**', 'public/**', 'dist/**', 'package.json', 'index.html'] };
  const put = (path: string, text: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  const rules = Array.from({ length: 40 }, (_, index) => `.block-${index}{display:grid;gap:${index}px;padding:12px 16px}`);
  put('src/style.css', rules.join(''));
  put('package.json', JSON.stringify({ name: 'landing', private: true, type: 'module', scripts: { dev: 'vite', build: 'tsc -b && vite build', test: 'vitest run' } }));
  put('src/app.css', rules.map(rule => rule.replaceAll('{', ' {\n  ').replaceAll(';', ';\n  ').replace(/\s*}$/, '\n}')).join('\n\n'));
  put('src/App.tsx', 'export function App() {\n  return <main>Readable</main>;\n}\n');
  put('dist/assets/index.css', rules.join(''));
  put('public/vendor.min.js', rules.join(''));
  put('oh-my-design/notes.css', rules.join(''));
  assert.deepEqual(unreadableSources(root, route).sort(), ['package.json', 'src/style.css']);
  assert.throws(() => requireReadableSource(root, route), /SOURCE_NOT_READABLE: package\.json, src\/style\.css are packed/);
  put('src/style.css', rules.join('\n'));
  put('package.json', `${JSON.stringify(JSON.parse('{"name":"landing","private":true}'), null, 2)}\n`);
  assert.doesNotThrow(() => requireReadableSource(root, route));
});

test('a new React project keeps one component per file and tests behavior; an existing project keeps its conventions', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-reviewable-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path: string, text: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  const component = (name: string) => `export function ${name}() {\n${'  const value = 1;\n'.repeat(60)}  return <section>{value}</section>;\n}\n`;
  const manifest = (devDependencies: Record<string, string>) => `${JSON.stringify({ name: 'landing', private: true,
    scripts: { build: 'tsc --noEmit && vite build', test: 'node --test src/content.test.mjs' }, dependencies: { react: '^19.1.0' }, devDependencies }, null, 2)}\n`;
  const route = { allowedPaths: ['src/**', 'package.json'], projectMode: 'greenfield' as const };
  put('src/main.tsx', ['Hero', 'Loop', 'Proof', 'Install'].map(component).join('\n'));
  put('package.json', manifest({ vite: '^6.3.0' }));
  assert.deepEqual(crowdedComponentFiles(root, route), ['src/main.tsx']);
  assert.match(missingBehaviorTests(root) ?? '', /no component test runner/);
  assert.throws(() => requireReviewableSource(root, route), /SOURCE_NOT_REVIEWABLE: src\/main\.tsx holds several components.*test rendered behavior/);
  assert.doesNotThrow(() => requireReviewableSource(root, { ...route, projectMode: 'existing' as const }));
  // At the first render the layout is enforced already; tests are owed only at completion.
  assert.throws(() => requireReviewableSource(root, route, 'first-render'), /holds several components[^.]*guides\/code\.md\)\.$/);
  rmSync(join(root, 'src/main.tsx'));
  for (const name of ['Hero', 'Loop', 'Proof', 'Install']) put(`src/sections/${name}.tsx`, component(name));
  assert.doesNotThrow(() => requireReviewableSource(root, route, 'first-render'));
  put('package.json', manifest({ vite: '^6.3.0', vitest: '^3.2.0', '@testing-library/react': '^16.3.0' }));
  assert.doesNotThrow(() => requireReviewableSource(root, route));
});

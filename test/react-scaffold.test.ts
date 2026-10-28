import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scaffoldReactProject } from '../core/design/react-scaffold.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

// Stands in for create-vite: the template files, including ones outside a landing's route scope.
const template = (directory: string) => {
  const app = join(directory, 'app');
  mkdirSync(join(app, 'src/assets'), { recursive: true });
  writeFileSync(join(app, 'package.json'), '{\n  "name": "app"\n}\n');
  writeFileSync(join(app, 'index.html'), '<!doctype html>\n<div id="root"></div>\n');
  writeFileSync(join(app, 'src/main.tsx'), "import './index.css';\n");
  writeFileSync(join(app, 'src/assets/react.svg'), '<svg/>');
  writeFileSync(join(app, 'README.md'), '# template\n');
  writeFileSync(join(app, '.gitignore'), 'node_modules\n');
};

function project(t: test.TestContext, projectMode = 'greenfield') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-scaffold-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build a landing page for the project in the oh-my-design folder.';
  const { invocation, writer } = createModelLedRouteContext(root, request);
  const input = modelLedInput(request);
  input.projectMode = projectMode;
  publishAdaptiveRoute(root, input, writer, invocation);
  mkdirSync(join(root, 'oh-my-design'));
  writeFileSync(join(root, 'oh-my-design/README.md'), 'material\n');
  return { root, writer, route: readPersistedRoute(root, invocation) };
}

test('a new project starts from the template; material and files outside scope are left alone', t => {
  const { root, writer, route } = project(t);
  writeFileSync(join(root, 'index.html'), '<!doctype html>\n<p>mine</p>\n');
  const result = scaffoldReactProject(root, route, writer, template);
  assert.deepEqual(result.written, ['package.json', 'src/assets/react.svg', 'src/main.tsx']);
  assert.deepEqual(result.kept, ['index.html']);
  assert.deepEqual(result.outsideScope, ['.gitignore', 'README.md']);
  assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), '<!doctype html>\n<p>mine</p>\n');
  assert.equal(readFileSync(join(root, 'oh-my-design/README.md'), 'utf8'), 'material\n');
  assert.equal(existsSync(join(root, 'README.md')), false);
  assert.throws(() => scaffoldReactProject(root, route, writer, template), /SCAFFOLD_EXISTS/);
});

test('an existing project keeps its stack, and a failed template writes nothing', t => {
  const existing = project(t, 'existing');
  assert.throws(() => scaffoldReactProject(existing.root, existing.route, existing.writer, template), /SCAFFOLD_NOT_GREENFIELD/);
  const fresh = project(t);
  assert.throws(() => scaffoldReactProject(fresh.root, fresh.route, fresh.writer, () => { throw new Error('SCAFFOLD_FAILED: offline'); }), /offline/);
  assert.equal(existsSync(join(fresh.root, 'package.json')), false);
});

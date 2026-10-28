import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { npmBinLinkTarget, validateFixedDerivedProjectRoot } from '../core/runtime/derived-project-tree.ts';

for (const path of [
  'node_modules/.bin/esbuild',
  'node_modules/vite-node/node_modules/.bin/esbuild',
  'node_modules/@scope/tool/node_modules/runner/node_modules/.bin/esbuild',
]) {
  test(`fixed dependency tree accepts conventional npm link ${path}`, t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-nested-bin-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const target = '../esbuild/bin/esbuild';
    const binary = join(dirname(path), target);
    mkdirSync(join(root, dirname(binary)), { recursive: true });
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, binary), 'executable fixture\n');
    symlinkSync(target, join(root, path));

    validateFixedDerivedProjectRoot(root, 'node_modules');
    assert.equal(readlinkSync(join(root, path)), target);
  });
}

test('npm link paths refuse non-package nesting, absolute targets and every bin-to-bin target', () => {
  for (const [path, target] of [
    ['node_modules/tool/assets/.bin/run', '../run.js'],
    ['node_modules/tool/node_modules/.bin/run', '/tmp/run.js'],
    ['node_modules/tool/node_modules/.bin/run', '../../../../outside.js'],
    ['node_modules/tool/node_modules/.bin/run', '../../../.bin/other'],
    ['node_modules/.bin/run', '../tool/node_modules/.bin/other'],
  ] as const) {
    assert.equal(npmBinLinkTarget(path, target), undefined, `${path} -> ${target}`);
  }
});

for (const kind of ['escaping', 'missing', 'chained'] as const) {
  test(`fixed dependency tree rejects ${kind} nested npm bin targets`, t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-nested-bin-refusal-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const path = 'node_modules/tool/node_modules/.bin/run';
    mkdirSync(join(root, dirname(path)), { recursive: true });
    let target = '../missing/bin/run';
    if (kind === 'escaping') {
      target = '../../../../outside.js';
      writeFileSync(join(root, 'outside.js'), 'must remain outside derived tree\n');
    } else if (kind === 'chained') {
      target = '../linked/bin/run';
      mkdirSync(join(root, 'node_modules', 'actual', 'bin'), { recursive: true });
      writeFileSync(join(root, 'node_modules', 'actual', 'bin', 'run'), 'fixture\n');
      symlinkSync('../../actual', join(root, 'node_modules', 'tool', 'node_modules', 'linked'));
    }
    symlinkSync(target, join(root, path));

    assert.throws(() => validateFixedDerivedProjectRoot(root, 'node_modules'), /unsafe symlink/);
    assert.equal(readlinkSync(join(root, path)), target);
  });
}

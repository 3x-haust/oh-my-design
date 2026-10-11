import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createTestNativePiInvocation, getNativePiRun, stageNativePiCommand } from '../core/runtime/native-pi-run.ts';

test('native art-direction uses host command authority and still refuses missing evaluator evidence', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-art-direction-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runtimeRoot = fileURLToPath(new URL('./fixtures/native-cli', import.meta.url));
  const cliPath = join(runtimeRoot, 'bin/omd.ts');
  const nodePath = realpathSync(process.execPath);
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const invocation = createTestNativePiInvocation({ root, host: {
    nodePath, nodeSha256: hash(nodePath), cliPath, cliSha256: hash(cliPath),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'art-parent',
  } });
  writeFileSync(join(root, 'input.json'), '{}');
  writeFileSync(join(root, 'index.html'), 'unchanged source');
  const staged = stageNativePiCommand({ run: getNativePiRun(invocation, root), runtimeRoot,
    argv: ['art-direction', 'check', '--input', 'input.json', '--json'] });
  t.after(staged.dispose);
  const result = spawnSync(nodePath, [cliPath, ...staged.argv], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ART_DIRECTION_EVALUATOR_AUTHORIZATION_REQUIRED/);
  assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), 'unchanged source');
  assert.equal(existsSync(join(root, '.omd/art-direction.json')), false);
});

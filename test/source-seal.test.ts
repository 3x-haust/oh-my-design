import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSourceSeal, validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-source-seal-'));
  for (const dir of ['.omd', 'src', 'public', 'dist', 'node_modules/pkg', 'generated', 'test']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, '.omd', 'copy-deck.md'), 'copy-v1');
  writeFileSync(join(root, '.omd', 'type-proof.md'), 'type-v1');
  writeFileSync(join(root, '.omd', 'composition.md'), 'composition-v1');
  writeFileSync(join(root, 'src', 'app.ts'), 'export const app = 1;');
  writeFileSync(join(root, 'public', 'mark.svg'), '<svg/>');
  writeFileSync(join(root, 'dist', 'app.js'), 'generated');
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'dependency');
  writeFileSync(join(root, 'generated', 'client.ts'), 'generated');
  writeFileSync(join(root, 'test', 'app.test.ts'), 'test');
  writeFileSync(join(root, 'package-lock.json'), '{}');
  return root;
}

test('source seal hashes approved inputs and a sorted narrow production source set', () => {
  const root = setup();
  const seal = createSourceSeal(root, '2026-07-14T00:00:00.000Z');
  assert.deepEqual(seal.sources.map((item) => item.path), ['public/mark.svg', 'src/app.ts']);
  assert.match(seal.inputs.copyDeckSha256, /^[0-9a-f]{64}$/);
  assert.match(seal.inputs.typeProofSha256, /^[0-9a-f]{64}$/);
  assert.match(seal.inputs.compositionSha256, /^[0-9a-f]{64}$/);
  assert.equal(seal.sealedAt, '2026-07-14T00:00:00.000Z');
});

test('source check passes fresh seal and ignores generated, dependency, cache, and lockfile changes', () => {
  const root = setup();
  writeSourceSeal(root);
  writeFileSync(join(root, 'dist', 'app.js'), 'changed generated');
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'changed dependency');
  writeFileSync(join(root, 'package-lock.json'), '{"changed":true}');
  assert.deepEqual(validateSourceSeal(root), []);
});

test('source check rejects parsed seals with malformed input hashes or source items without throwing', async (t) => {
  const validRoot = setup();
  writeSourceSeal(validRoot);
  assert.deepEqual(validateSourceSeal(validRoot), []);

  const invalidCases: Array<[string, (seal: ReturnType<typeof createSourceSeal>) => unknown]> = [
    ['missing approved input hash', (seal) => {
      const inputs = { ...seal.inputs } as Partial<typeof seal.inputs>;
      delete inputs.copyDeckSha256;
      return { ...seal, inputs };
    }],
    ['non-string approved input hash', (seal) => ({ ...seal, inputs: { ...seal.inputs, typeProofSha256: 42 } })],
    ['non-hex approved input hash', (seal) => ({ ...seal, inputs: { ...seal.inputs, compositionSha256: 'z'.repeat(64) } })],
    ['short approved input hash', (seal) => ({ ...seal, inputs: { ...seal.inputs, copyDeckSha256: 'a'.repeat(63) } })],
    ['null source item', (seal) => ({ ...seal, sources: [null] })],
    ['source item missing path', (seal) => ({ ...seal, sources: [{ sha256: seal.sources[0]!.sha256 }] })],
    ['source item missing hash', (seal) => ({ ...seal, sources: [{ path: seal.sources[0]!.path }] })],
    ['source path escapes root', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, path: '../outside.ts' }] })],
    ['source path contains parent segment', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, path: 'src/../outside.ts' }] })],
    ['source path is absolute', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, path: '/tmp/outside.ts' }] })],
    ['source path uses backslashes', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, path: 'src\\app.ts' }] })],
    ['source hash is invalid', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, sha256: 'not-a-sha256' }] })],
  ];

  for (const [name, mutate] of invalidCases) {
    await t.test(name, () => {
      const root = setup();
      const malformed = mutate(createSourceSeal(root, '2026-07-14T00:00:00.000Z'));
      writeFileSync(join(root, '.omd', 'source-seal.json'), `${JSON.stringify(malformed)}\n`);
      assert.doesNotThrow(() => validateSourceSeal(root));
      assert.deepEqual(validateSourceSeal(root), [{
        id: 'SOURCE-SEAL-STALE',
        path: '.omd/source-seal.json',
        message: 'source seal schema is invalid',
      }]);
    });
  }
});

test('source check fails missing seal and stale approved input or production source', () => {
  const root = setup();
  assert.equal(validateSourceSeal(root)[0]?.id, 'SOURCE-SEAL-MISSING');
  writeSourceSeal(root);
  writeFileSync(join(root, 'src', 'app.ts'), 'export const app = 2;');
  assert.ok(validateSourceSeal(root).some((item) => item.id === 'SOURCE-SEAL-STALE' && item.path === 'src/app.ts'));
  writeSourceSeal(root);
  writeFileSync(join(root, '.omd', 'copy-deck.md'), 'copy-v2');
  assert.ok(validateSourceSeal(root).some((item) => item.id === 'SOURCE-SEAL-STALE' && item.path === '.omd/copy-deck.md'));
});

test('CLI seals, checks, and reports stale bytes without claiming semantic fidelity', () => {
  const root = setup();
  const sealed = spawnSync(process.execPath, [cli, 'source', '--seal', root], { encoding: 'utf8' });
  assert.equal(sealed.status, 0, sealed.stderr);
  const clean = spawnSync(process.execPath, [cli, 'source', '--check', root, '--json'], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(JSON.parse(clean.stdout), []);
  writeFileSync(join(root, 'public', 'mark.svg'), '<svg><path/></svg>');
  const stale = spawnSync(process.execPath, [cli, 'source', '--check', root, '--json'], { encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.ok((JSON.parse(stale.stdout) as Array<{ id: string }>).some((item) => item.id === 'SOURCE-SEAL-STALE'));
  assert.doesNotMatch(stale.stdout, /semantic|fidelity|meaning/i);
});

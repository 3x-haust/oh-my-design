import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { validateSourceBoundProofCurrentness } from '../core/composition-contract/source-currentness.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function writeProof(path: string, entry: string, sha256: string): void {
  writeFileSync(path, [
    '# Proof',
    '',
    '## Production revision binding',
    '',
    `- Production entry: \`${entry}\``,
    `- Production revision SHA-256: \`${sha256}\``,
    '',
  ].join('\n'));
}

function fixture(): { root: string; revision: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-source-proof-'));
  roots.push(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, '.omd'), { recursive: true });
  writeFileSync(join(root, 'src', 'index.html'), '<link rel="stylesheet" href="./styles.css"><script src="./app.js"></script>');
  writeFileSync(join(root, 'src', 'styles.css'), 'body { color: #111; }');
  writeFileSync(join(root, 'src', 'app.js'), 'document.body.dataset.ready = "true";');
  const revision = servedProjectTreeSha256(root, 'src/index.html');
  writeProof(join(root, '.omd', 'type-proof.md'), 'src/index.html', revision);
  writeProof(join(root, '.omd', 'composition.md'), 'src/index.html', revision);
  return { root, revision };
}

test('matching type and composition production revision bindings pass', () => {
  const { root } = fixture();
  assert.deepEqual(validateSourceBoundProofCurrentness(root), []);
});

test('a production source mutation invalidates both current proofs', () => {
  const { root } = fixture();
  writeFileSync(join(root, 'src', 'app.js'), 'document.body.dataset.ready = "changed";');
  const findings = validateSourceBoundProofCurrentness(root);
  assert.equal(findings.filter(({ id }) => id === 'SOURCE_BOUND_PROOF_STALE').length, 2);
});

test('current proofs require the closed production revision binding section', () => {
  const { root } = fixture();
  writeFileSync(join(root, '.omd', 'type-proof.md'), '# Legacy type proof\n');
  const findings = validateSourceBoundProofCurrentness(root);
  assert.ok(findings.some(({ id, path }) => id === 'SOURCE_BOUND_PROOF_MISSING' && path === '.omd/type-proof.md'));
});

test('type and composition proofs must bind the same production entry and revision', () => {
  const { root, revision } = fixture();
  writeProof(join(root, '.omd', 'composition.md'), 'src/other.html', revision);
  const findings = validateSourceBoundProofCurrentness(root);
  assert.ok(findings.some(({ id }) => id === 'SOURCE_BOUND_PROOF_MISMATCH'));
});

test('production entry paths cannot escape the project', () => {
  const { root, revision } = fixture();
  writeProof(join(root, '.omd', 'type-proof.md'), '../outside.html', revision);
  const findings = validateSourceBoundProofCurrentness(root);
  assert.ok(findings.some(({ id }) => id === 'SOURCE_BOUND_PROOF_INVALID'));
});

test('the proof CLI publishes the same currentness gate', () => {
  const { root, revision } = fixture();
  const revisionResult = spawnSync(process.execPath, [
    resolve('bin/omd.ts'),
    'proof',
    'revision',
    '--input',
    'src/index.html',
    '--json',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(revisionResult.status, 0, revisionResult.stderr);
  assert.deepEqual(JSON.parse(revisionResult.stdout), {
    entry: 'src/index.html',
    revisionSha256: revision,
  });
  const result = spawnSync(process.execPath, [
    resolve('bin/omd.ts'),
    'proof',
    '--check',
    '--json',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

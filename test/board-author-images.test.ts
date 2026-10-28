import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC',
  'base64',
);

function fixture(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'omd-image-fragment-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd/refs'), { recursive: true });
  writeFileSync(join(root, '.omd/refs/captured.png'), PNG);
  const input = {
    inputPath: '.omd/refs/captured.png',
    provenance: {
      sourcePage: 'https://product.example/help/conversation',
      captureRegion: 'Message and composer illustration',
      licenseStatus: 'unknown',
      rightsNotes: 'Private visual reference; source pixels are not a production asset.',
      capturedAt: '2026-09-13T00:00:00.000Z',
    },
    transfer: {
      visualRole: 'message to composer adjacency',
      principles: ['Keep selected identity above the message and composer.'],
    },
  };
  const inputPath = join(root, 'image-import-input.json');
  const run = (value: unknown) => {
    writeFileSync(inputPath, JSON.stringify(value));
    return spawnSync(process.execPath, [CLI, 'ref', 'import-image', inputPath, '--json'], {
      cwd: root,
      encoding: 'utf8',
    });
  };
  return { root, input, run };
}

test('ref import-image retains a project-local PNG and its comparison-only provenance', t => {
  const { input, run } = fixture(t);
  const result = run(input);
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout) as {
    id: string;
    imagePath: string;
    provenance: { sourcePage: string };
    transfer: { visualRole: string };
  };
  assert.match(record.id, /^fragment-[a-f0-9]{16}$/);
  assert.match(record.imagePath, /^\.omd\/refs\/design\/fragments\//);
  assert.equal(record.provenance.sourcePage, input.provenance.sourcePage);
  assert.equal(record.transfer.visualRole, input.transfer.visualRole);
});

test('ref import-image refuses remote, absolute, escaping, and caller-forged authority fields', t => {
  const { root, input, run } = fixture(t);
  for (const inputPath of [
    'https://product.example/capture.png',
    join(root, input.inputPath),
    '../capture.png',
  ]) {
    const rejected = run({ ...input, inputPath });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /local PNG path|plain relative path/);
  }
  const forged = run({ ...input, id: 'fragment-0000000000000000' });
  assert.equal(forged.status, 1);
  assert.match(forged.stderr, /derived fragment authority/);
});

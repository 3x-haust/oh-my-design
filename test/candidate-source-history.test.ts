import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  captureCandidateSourceTree,
  persistCandidateSourceHistory,
  readCandidateSourceHistory,
  type CandidateSourceHistoryReference,
} from '../core/brief/candidate-source-history.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

type Fixture = Readonly<{
  root: string;
  entryPath: string;
  candidate: string;
  files: ReadonlyMap<string, Buffer>;
}>;

function fixture(t: test.TestContext): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-candidate-source-history-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const candidate = join(root, '.omd', '.cache', 'sketches', 'chosen');
  mkdirSync(join(candidate, 'assets'), { recursive: true });
  const files = new Map<string, Buffer>([
    ['index.html', Buffer.from('<link rel="stylesheet" href="./styles.css"><img src="./assets/mark.bin"><script src="./app.js"></script>\n')],
    ['styles.css', Buffer.from('body { color: #123456; }\n')],
    ['app.js', Buffer.from('document.body.dataset.ready = "true";\n')],
    ['Z.css', Buffer.from('/* uppercase asset */\n')],
    ['a.css', Buffer.from('/* lowercase asset */\n')],
    ['assets/mark.bin', Buffer.from([0, 1, 2, 3, 254, 255])],
  ]);
  for (const [path, bytes] of files) {
    const target = join(candidate, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeFileSync(join(root, '.omd', 'frame.md'), '# Frame\n');
  writeFileSync(join(root, '.omd', 'copy-deck.md'), '# Copy\n');
  writeFileSync(join(root, '.omd', 'composition.md'), '# Composition\n');
  return {
    root,
    candidate,
    files,
    entryPath: '.omd/.cache/sketches/chosen/index.html',
  };
}

function persisted(t: test.TestContext): Fixture & Readonly<{
  reference: CandidateSourceHistoryReference;
}> {
  const value = fixture(t);
  const capture = captureCandidateSourceTree(value.root, value.entryPath);
  const reference = persistCandidateSourceHistory(
    value.root,
    capture,
    createTestProjectWriteAdapter(value.root),
  );
  return { ...value, reference };
}

test('history preserves exact served candidate bytes and present source-free input digests after live edits', t => {
  const value = fixture(t);
  const expectedTreeSha256 = servedProjectTreeSha256(value.root, value.entryPath);
  const liveBefore = new Map([...value.files].map(([path]) => [
    path,
    readFileSync(join(value.candidate, path)),
  ]));
  const capture = captureCandidateSourceTree(value.root, value.entryPath);
  const reference = persistCandidateSourceHistory(
    value.root,
    capture,
    createTestProjectWriteAdapter(value.root),
  );

  assert.equal(capture.treeSha256, expectedTreeSha256);
  assert.equal(reference.treeSha256, expectedTreeSha256);
  assert.match(reference.recordPath, /^\.omd\/candidate-source-history\/records\/sha256-[a-f0-9]{64}\.json$/);
  assert.equal(reference.treePath, `.omd/candidate-source-history/trees/sha256-${expectedTreeSha256}`);
  assert.ok(!reference.recordPath.startsWith('.omd/.cache/sketches/'));
  for (const [path, bytes] of liveBefore) {
    assert.deepEqual(readFileSync(join(value.candidate, path)), bytes);
  }

  writeFileSync(join(value.candidate, 'index.html'), '<main>changed</main>\n');
  writeFileSync(join(value.candidate, 'styles.css'), 'body { color: red; }\n');
  writeFileSync(join(value.candidate, 'assets', 'mark.bin'), Buffer.from([9, 9, 9]));
  writeFileSync(join(value.root, '.omd', 'frame.md'), '# Changed frame\n');

  const restored = readCandidateSourceHistory(value.root, reference);
  assert.equal(restored.record.sourceEntryPath, value.entryPath);
  assert.equal(restored.record.treeSha256, expectedTreeSha256);
  assert.deepEqual([...restored.files.keys()], [...value.files.keys()].sort());
  for (const [path, bytes] of value.files) {
    assert.deepEqual(restored.files.get(path), bytes);
  }
  assert.deepEqual(restored.record.inputDigests, [
    { kind: 'composition', path: '.omd/composition.md', sha256: hash('# Composition\n') },
    { kind: 'frame', path: '.omd/frame.md', sha256: hash('# Frame\n') },
    { kind: 'copy', path: '.omd/copy-deck.md', sha256: hash('# Copy\n') },
  ]);
  assert.equal(restored.record.inputDigests.some(input => input.kind === 'type'), false);
});

test('history rejects tampered stored candidate bytes without consulting the changed live candidate', t => {
  const value = persisted(t);
  writeFileSync(join(value.candidate, 'index.html'), '<main>new live work</main>\n');
  const sentinel = join(value.root, 'unrelated.txt');
  writeFileSync(sentinel, 'keep\n');
  writeFileSync(join(value.root, value.reference.treePath, 'styles.css'), 'tampered\n');

  assert.throws(
    () => readCandidateSourceHistory(value.root, value.reference),
    /CANDIDATE_SOURCE_HISTORY_INVALID/,
  );
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep\n');
  assert.equal(readFileSync(join(value.candidate, 'index.html'), 'utf8'), '<main>new live work</main>\n');
});

test('history rejects tampered records, wrong identities, and wrong tree bindings', t => {
  {
    const value = persisted(t);
    writeFileSync(join(value.root, value.reference.recordPath), '{"schema":"forged"}\n');
    assert.throws(
      () => readCandidateSourceHistory(value.root, value.reference),
      /CANDIDATE_SOURCE_HISTORY_INVALID/,
    );
  }
  {
    const value = persisted(t);
    const wrongIdentity = {
      ...value.reference,
      recordSha256: '0'.repeat(64),
    };
    assert.throws(
      () => readCandidateSourceHistory(value.root, wrongIdentity),
      /CANDIDATE_SOURCE_HISTORY_INVALID/,
    );
  }
  {
    const value = persisted(t);
    const wrongTree = {
      ...value.reference,
      treeSha256: 'f'.repeat(64),
    };
    assert.throws(
      () => readCandidateSourceHistory(value.root, wrongTree),
      /CANDIDATE_SOURCE_HISTORY_INVALID/,
    );
  }
});

test('history refuses traversal and symlinks without mutating unrelated files', t => {
  const value = fixture(t);
  const sentinel = join(value.root, 'unrelated.txt');
  writeFileSync(sentinel, 'keep\n');
  assert.throws(
    () => captureCandidateSourceTree(value.root, '../outside/index.html'),
    /normalized relative path|escapes the project root/,
  );
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep\n');

  const external = join(value.root, 'external.css');
  writeFileSync(external, 'body { color: hotpink; }\n');
  unlinkSync(join(value.candidate, 'styles.css'));
  symlinkSync(external, join(value.candidate, 'styles.css'));
  assert.throws(
    () => captureCandidateSourceTree(value.root, value.entryPath),
    /symlink/,
  );
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep\n');

  unlinkSync(join(value.candidate, 'styles.css'));
  writeFileSync(join(value.candidate, 'styles.css'), value.files.get('styles.css')!);
  const capture = captureCandidateSourceTree(value.root, value.entryPath);
  const reference = persistCandidateSourceHistory(
    value.root,
    capture,
    createTestProjectWriteAdapter(value.root),
  );
  const storedStyle = join(value.root, reference.treePath, 'styles.css');
  unlinkSync(storedStyle);
  symlinkSync(external, storedStyle);
  assert.throws(
    () => readCandidateSourceHistory(value.root, reference),
    /CANDIDATE_SOURCE_HISTORY_INVALID/,
  );
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep\n');
});


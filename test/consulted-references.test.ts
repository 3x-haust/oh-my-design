import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  consultedReferenceProjection,
  publishConsultedReferences,
} from '../core/design/consulted-references.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const INDEXED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAMAAADD/I+4AAAABlBMVEX/AAAA/wDSh+9xAAAAC0lEQVR4nGNgYAQAAAQAAr96P0oAAAAASUVORK5CYII=',
  'base64',
);
const REQUEST = sha256('compare these consulted references');
const POINTER = '.omd/consulted-references.json';
const RECORD_SCHEMA = 'consulted-references-v1';

function project(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'omd-consulted-references-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'inputs'));
  writeFileSync(join(root, 'inputs/indexed.png'), INDEXED_PNG);
  const second = PNG.sync.write(new PNG({ width: 3, height: 2 }));
  writeFileSync(join(root, 'inputs/second.png'), second);
  return {
    root,
    second,
    writer: createTestProjectWriteAdapter(root),
    input: {
      schema: 'consulted-references-input-v1',
      requestSha256: REQUEST,
      images: [{
        path: 'inputs/indexed.png',
        sha256: sha256(INDEXED_PNG),
        sourceUrl: 'https://reference.example/products/inbox?view=compact',
        role: 'primary',
      }, {
        path: 'inputs/second.png',
        sha256: sha256(second),
        sourceUrl: 'http://patterns.example/archive/card',
        role: 'supplemental',
      }] as const,
    },
  };
}

function pointer(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, POINTER), 'utf8')) as Record<string, unknown>;
}

function record(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, pointer(root).path as string), 'utf8')) as Record<string, unknown>;
}

function rewriteRecord(
  root: string,
  transform: (value: Record<string, unknown>) => Record<string, unknown>,
): void {
  const current = record(root);
  const next = transform(current);
  const bytes = Buffer.from(canonicalJson(next));
  const digest = sha256(bytes);
  const path = `.omd/consulted-references/records/${digest}.json`;
  mkdirSync(join(root, dirname(path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
  writeFileSync(join(root, POINTER), canonicalJson({
    schema: RECORD_SCHEMA,
    path,
    sha256: digest,
  }));
}

test('publishes exact consulted originals and projects only comparison-safe pixels', t => {
  const value = project(t);
  assert.equal(consultedReferenceProjection(value.root), null);

  const published = publishConsultedReferences(value.root, value.input, value.writer);
  assert.equal(published.authority, 'none');
  const stored = record(value.root);
  const images = stored.images as Array<Record<string, unknown>>;

  assert.equal(stored.schema, RECORD_SCHEMA);
  assert.equal(stored.requestSha256, REQUEST);
  assert.equal(stored.origin, 'reported');
  assert.equal(stored.authority, 'none');
  assert.equal(stored.use, 'comparison-only');
  assert.equal(stored.approval, 'not-approved');
  assert.equal(stored.selection, 'not-selected');
  assert.equal(stored.satisfaction, 'unknown');
  assert.equal(images[0]?.sourceUrl, value.input.images[0]?.sourceUrl);
  assert.deepEqual(
    readFileSync(join(value.root, images[0]?.path as string)),
    INDEXED_PNG,
  );
  assert.deepEqual(
    readFileSync(join(value.root, images[1]?.path as string)),
    value.second,
  );

  const projection = consultedReferenceProjection(value.root, REQUEST);
  assert.deepEqual(projection?.context, {
    schema: RECORD_SCHEMA,
    sha256: published.sha256,
    origin: 'reported',
    authority: 'none',
    use: 'comparison-only',
  });
  assert.deepEqual(projection?.renders.map(({ pngBase64, ...render }) => render), [{
    role: 'consulted-external-original',
    referenceRole: 'primary',
    width: 2,
    height: 1,
    captureSha256: sha256(INDEXED_PNG),
  }, {
    role: 'consulted-external-original',
    referenceRole: 'supplemental',
    width: 3,
    height: 2,
    captureSha256: sha256(value.second),
  }]);
  assert.deepEqual(
    projection?.renders.map(render => Buffer.from(render.pngBase64, 'base64')),
    [INDEXED_PNG, value.second],
  );
  assert.equal(JSON.stringify(projection).includes('reference.example'), false);
  assert.equal(JSON.stringify(projection).includes('patterns.example'), false);
  assert.equal(JSON.stringify(projection).includes('inputs/'), false);
});

test('publisher rejects closed-schema, provenance, image, role, and path violations before pointer mutation', t => {
  const value = project(t);
  publishConsultedReferences(value.root, value.input, value.writer);
  const before = readFileSync(join(value.root, POINTER));
  const reject = (input: unknown, pattern: RegExp) => {
    assert.throws(() => publishConsultedReferences(value.root, input, value.writer), pattern);
    assert.deepEqual(readFileSync(join(value.root, POINTER)), before);
  };

  reject({ ...value.input, approved: true }, /fields/);
  reject({ ...value.input, schema: 'consulted-references-input-v0' }, /schema/);
  reject({ ...value.input, requestSha256: 'bad' }, /request/);
  reject({ ...value.input, images: [] }, /images/);
  reject({ ...value.input, images: Array(9).fill(value.input.images[0]) }, /images/);
  reject({
    ...value.input,
    images: [{ ...value.input.images[0], sourceUrl: '/relative/reference' }],
  }, /URL/);
  reject({
    ...value.input,
    images: [{ ...value.input.images[0], sourceUrl: 'file:///tmp/reference.png' }],
  }, /URL/);
  reject({
    ...value.input,
    images: [{ ...value.input.images[0], role: 'selected' }],
  }, /role/);
  reject({
    ...value.input,
    images: [{ ...value.input.images[0], sha256: '0'.repeat(64) }],
  }, /digest/);
  reject({
    ...value.input,
    images: [value.input.images[0], {
      ...value.input.images[1],
      path: value.input.images[0].path,
      sha256: value.input.images[0].sha256,
    }],
  }, /duplicate image/);
  reject({
    ...value.input,
    images: [value.input.images[0], { ...value.input.images[1], role: 'primary' }],
  }, /primary/);
  reject({
    ...value.input,
    images: [{ ...value.input.images[0], path: '../outside.png' }],
  }, /escapes project root|contained|path/);

  const outside = join(value.root, '..', `outside-${createHash('sha256').update(value.root).digest('hex')}.png`);
  writeFileSync(outside, INDEXED_PNG);
  t.after(() => rmSync(outside, { force: true }));
  symlinkSync(outside, join(value.root, 'inputs/link.png'));
  reject({
    ...value.input,
    images: [{ ...value.input.images[0], path: 'inputs/link.png' }],
  }, /symlink|regular/);

  writeFileSync(join(value.root, 'inputs/truncated.png'), INDEXED_PNG.subarray(0, 50));
  reject({
    ...value.input,
    images: [{
      ...value.input.images[0],
      path: 'inputs/truncated.png',
      sha256: sha256(INDEXED_PNG.subarray(0, 50)),
    }],
  }, /PNG|image/);
});

test('projection refuses malformed pointers, records, signatures, request scope, and image bytes', t => {
  const value = project(t);
  publishConsultedReferences(value.root, value.input, value.writer);
  const originalPointer = readFileSync(join(value.root, POINTER));

  assert.throws(
    () => consultedReferenceProjection(value.root, sha256('different request')),
    /request scope/,
  );

  const malformedPointer = { ...pointer(value.root), unexpected: true };
  writeFileSync(join(value.root, POINTER), canonicalJson(malformedPointer));
  assert.throws(() => consultedReferenceProjection(value.root), /fields/);
  writeFileSync(join(value.root, POINTER), originalPointer);

  rewriteRecord(value.root, current => ({ ...current, signature: 'tampered' }));
  assert.throws(() => consultedReferenceProjection(value.root), /authority|signature/);

  writeFileSync(join(value.root, POINTER), originalPointer);
  rewriteRecord(value.root, current => {
    const { signature: _signature, ...unsigned } = current;
    const malformed = { ...unsigned, approved: true };
    return {
      ...malformed,
      signature: signNativeObservation(
        value.root,
        RECORD_SCHEMA,
        sha256(canonicalJson(malformed)),
      ),
    };
  });
  assert.throws(() => consultedReferenceProjection(value.root), /fields/);

  writeFileSync(join(value.root, POINTER), originalPointer);
  const stored = record(value.root);
  const first = (stored.images as Array<Record<string, unknown>>)[0]!;
  writeFileSync(join(value.root, first.path as string), Buffer.from('tampered'));
  assert.throws(() => consultedReferenceProjection(value.root), /image digest/);
});

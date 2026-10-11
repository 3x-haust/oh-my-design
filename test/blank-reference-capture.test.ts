import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { isNearUniformBlankCapture } from '../core/ref/blank-capture.ts';
import { addRefsBatch } from '../core/ref/batch.ts';
import { loadDesignCandidates, stageDesignCandidate } from '../core/ref/reference-candidate.ts';
import { referenceDiscoveryWork } from '../core/ref/discovery-work.ts';
import { loadRefs, refImagePath, refRecordPath } from '../core/ref/store.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { decodePng } from '../core/motion/energy.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { testPng } from './helpers/search-execution.ts';

const rulesRoot = fileURLToPath(new URL('../core/rules/builtin', import.meta.url));

function indexedPng(background: number, populated = false): Buffer {
  const chunk = (type: string, bytes: Buffer): Buffer => {
    const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
    const body = Buffer.concat([Buffer.from(type), bytes]);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0); header.writeUInt32BE(4, 4);
  header[8] = 8; header[9] = 3;
  const rows = Buffer.alloc(20);
  if (populated) { rows[1] = 1; rows[2] = 1; }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('PLTE', Buffer.from([background, background, background, 100, 40, 160])),
    chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('native indexed PNG originals retain blank refusal and admit populated pixels without rewriting bytes', () => {
  for (const background of [0, 255]) {
    const blank = indexedPng(background);
    assert.equal(isNearUniformBlankCapture(blank), true);
    const populated = indexedPng(background, true);
    const original = Buffer.from(populated);
    assert.equal(isNearUniformBlankCapture(populated), false);
    assert.deepEqual(populated, original);
  }
});

test('indexed PNG pixel inspection rejects corrupt or truncated originals', () => {
  const image = indexedPng(255, true);
  assert.throws(() => isNearUniformBlankCapture(image.subarray(0, image.length - 12)));
  const corrupt = Buffer.from(image); corrupt[50] = 99;
  assert.throws(() => isNearUniformBlankCapture(corrupt));
});

test('design ref capture refuses blank viewport pixels without rejecting visible screens or scoped components', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-blank-reference-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const server = createServer((request, response) => {
    response.writeHead(202, { 'Content-Type': 'text/html; charset=utf-8' });
    if (request.url === '/white') {
      response.end('<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:#fff}</style>');
      return;
    }
    if (request.url === '/dark') {
      response.end('<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:#050505}</style>');
      return;
    }
    if (request.url === '/scoped') {
      response.end('<!doctype html><style>html,body{margin:0;background:#fff}.status{width:12px;height:12px;background:#176f44}</style><div class="status" aria-label="Ready"></div>');
      return;
    }
    response.end(`<!doctype html><style>
      html,body{margin:0;background:#f4f1ea;color:#17202a;font:16px sans-serif}
      main{margin:24px;padding:24px;background:white;border:2px solid #17202a}
      button{padding:12px 18px;background:#176f44;color:white;border:0}
    </style><main><h1>Application workspace</h1><p>Review the current request and prepare the next document.</p><button>Continue</button></main>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const specs = [
    { source: `${base}/white`, as: 'blank-white', lane: 'design' as const, shot: true, fromUser: true, energy: false, viewport: '320x240' },
    { source: `${base}/dark`, as: 'blank-dark', lane: 'design' as const, shot: true, fromUser: true, energy: false, viewport: '320x240' },
    { source: `${base}/screen`, as: 'task-screen', lane: 'design' as const, shot: true, fromUser: true, energy: false, viewport: '320x240' },
    { source: `${base}/scoped`, as: 'status-dot', lane: 'design' as const, selector: '.status', shot: true, fromUser: true, energy: false, viewport: '320x240' },
  ];
  const result = await addRefsBatch(root, specs, {
    rulesRoot, concurrency: 1, browserConfig: { mode: 'default' },
  }, createTestProjectWriteAdapter(root));

  for (const spec of specs.slice(0, 2)) {
    const outcome = result.outcomes.find(item => item.as === spec.as);
    assert.equal(outcome?.ok, false, `${spec.as} must be refused`);
    assert.match(outcome?.error ?? '', /blank full-viewport design capture/i);
    const identity = { source: spec.source, component: spec.as, researchLane: 'design' as const };
    assert.equal(existsSync(refImagePath(root, identity)), false, `${spec.as} PNG must not persist`);
    assert.equal(existsSync(refRecordPath(root, identity)), false, `${spec.as} record must not persist`);
  }

  for (const spec of specs.slice(2)) {
    const outcome = result.outcomes.find(item => item.as === spec.as);
    assert.equal(outcome?.ok, true, outcome?.error ?? `${spec.as} capture failed`);
    const identity = { source: spec.source, component: spec.as, researchLane: 'design' as const };
    assert.equal(existsSync(refImagePath(root, identity)), true, `${spec.as} PNG must persist`);
    assert.equal(existsSync(refRecordPath(root, identity)), true, `${spec.as} record must persist`);
  }
  assert.deepEqual(loadRefs(root).map(ref => ref.component).sort(), ['status-dot', 'task-screen']);
  assert.ok(loadRefs(root).every(ref => ref.acquisition?.httpStatus === 202));
});

test('selected-route design batch quarantines a visible whole viewport until Eye review', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-candidate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invocation = publishTestAdaptiveRoute(root, inputSkeleton('product-route-input').skeleton,
    'Benefit application workspace with review and submission');
  const writer = createTestProjectWriteAdapter(root, invocation);
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><main style="padding:40px;background:#eef4fc"><h1>Application workspace</h1><p>Review your eligibility and submit your application.</p><button>Continue</button></main>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const source = `http://127.0.0.1:${address.port}/workspace`;
  const result = await addRefsBatch(root, [{ source, as: 'task', lane: 'design', fromUser: true,
    shot: true, energy: false, viewport: '320x240' }], {
    rulesRoot, invocation, concurrency: 1, browserConfig: { mode: 'default' },
  }, writer);
  assert.equal(result.outcomes[0]?.ok, true, result.outcomes[0]?.error ?? 'candidate batch capture failed');
  assert.match(result.outcomes[0]?.candidatePath ?? '', /^\.omd\/discovery\/design\/candidates\//);
  const identity = { source, component: 'task', researchLane: 'design' as const };
  assert.equal(existsSync(refRecordPath(root, identity)), false);
  assert.equal(existsSync(refImagePath(root, identity)), false);
  assert.equal(loadRefs(root).length, 0);
  const candidates = loadDesignCandidates(root);
  assert.equal(candidates.length, 1);
  assert.equal(result.outcomes[0]?.candidateImagePath, candidates[0]!.imagePath);
  const pixels = decodePng(candidates[0]!.image);
  assert.deepEqual([pixels.width, pixels.height], [640, 480]);
  assert.equal(candidates[0]!.reference.imagePath, refImagePath(root, identity).slice(root.length + 1));
  const whiteImage = testPng(640, 480, 255);
  const whiteSource = `${source}?empty`;
  const whiteIdentity = { source: whiteSource, component: 'white-user-browser', researchLane: 'design' as const };
  const blank = { ...candidates[0]!.reference,
    source: whiteSource, component: whiteIdentity.component,
    imagePath: relative(writer.projectRoot, refImagePath(writer.projectRoot, whiteIdentity)),
    acquisition: { ...candidates[0]!.reference.acquisition!, requestedUrl: whiteSource, finalUrl: whiteSource,
      imageSha256: createHash('sha256').update(whiteImage).digest('hex') },
  };
  assert.throws(() => stageDesignCandidate(root, blank, whiteImage, writer), /REFERENCE_CAPTURE_BLANK/);
  assert.equal(loadDesignCandidates(root).length, 1);
  const work = referenceDiscoveryWork(root, readPersistedRoute(root, invocation));
  assert.equal(work.progress.designFamilies, 0);
  assert.equal(work.action?.kind, 'review-candidates');
  assert.equal(work.next, 'omd ref direction-review --json');
});

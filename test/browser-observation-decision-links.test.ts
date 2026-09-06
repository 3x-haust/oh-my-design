import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import type { DesignDecision } from '../core/deliberation/contracts.ts';
import { writeObservationV2 } from '../core/runtime/observation.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import {
  BROWSER_OBSERVATION_SCHEMA,
  BROWSER_OBSERVATION_SET_SCHEMA,
  BrowserObservationDecisionLinkError,
  browserObservationSha256,
  designDecisionSha256,
  type BrowserObservationCore,
  validateBrowserObservationArtifacts,
  validateBrowserObservationDecisionLinks,
} from '../core/runtime/browser-observation.ts';

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const decision = (): DesignDecision => ({
  id: 'hero-strategy', stage: 'composition', risk: 'medium', owner: 'omd-composer',
  question: 'Which hero structure keeps the primary action visible?',
  alternatives: [{ id: 'copy-first', label: 'Copy first' }, { id: 'demo-first', label: 'Demo first' }],
  selected: 'demo-first', evidence: ['capture:hero-mobile'], constraints: ['Primary action remains visible'],
  rejected: [{ id: 'copy-first', reason: 'The measured mobile capture places the action below the fold.' }],
  affects: ['zone:hero'], dependsOn: [], reversible: true, tradeoffs: [],
});
const graphBytes = (decisions: readonly DesignDecision[] = [decision()]): Buffer => Buffer.from(`${canonicalJson({ schema: 'decision-graph-v1', decisions })}\n`);
const captureBytes = Buffer.from('measured-browser-capture');
const crc32 = (bytes: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const png = (width: number, height: number): Buffer => {
  const chunk = (type: string, value: Buffer): Buffer => {
    const bytes = Buffer.alloc(value.length + 12);
    bytes.writeUInt32BE(value.length, 0); bytes.write(type, 4); value.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, value.length + 8)), value.length + 8);
    return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
};
const core = () => ({
  schema: BROWSER_OBSERVATION_SCHEMA,
  testedUrl: 'http://localhost/',
  testedState: 'primary-action-visible',
  viewport: { width: 390, height: 844 },
  observableResult: {
    kind: 'screenshot',
    capture: { path: '.omd/.cache/hero-mobile.png', sha256: sha(captureBytes) },
    result: { measurement: 'viewport-pixels', width: 390, height: 844 },
  },
  decisionRefs: [{ decisionId: 'hero-strategy', decisionSha256: designDecisionSha256(decision()) }],
} satisfies BrowserObservationCore);
const carrier = () => {
  const bytes = graphBytes();
  const observation = core();
  return {
    schema: BROWSER_OBSERVATION_SET_SCHEMA,
    decisionGraphSha256: sha(bytes),
    observations: [{ ...observation, observationSha256: browserObservationSha256(observation) }],
  };
};
const evidence = (): { browserObservations: ReturnType<typeof carrier> } => ({ browserObservations: carrier() });
const code = (expected: string) => (error: unknown): boolean => error instanceof BrowserObservationDecisionLinkError && error.code === expected;

test('a measured browser observation binds URL, state, viewport, result, capture, and exact design decision', () => {
  const parsed = validateBrowserObservationDecisionLinks(evidence(), graphBytes(), true);
  assert.ok(parsed);
  assert.equal(parsed.observations[0]?.testedUrl, 'http://localhost/');
  assert.equal(parsed.observations[0]?.decisionRefs[0]?.decisionId, 'hero-strategy');
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.observations[0]), true);
  assert.doesNotThrow(() => validateBrowserObservationArtifacts(parsed, (path) => {
    assert.equal(path, '.omd/.cache/hero-mobile.png');
    return captureBytes;
  }, false));
});

test('missing, unknown, unbound, stale-graph, and mismatched observation links fail with stable typed errors', () => {
  assert.throws(() => validateBrowserObservationDecisionLinks({}, graphBytes(), true), code('MISSING_DECISION_LINK'));
  const unknown = carrier();
  unknown.observations[0]?.decisionRefs.splice(0, 1, { decisionId: 'unknown-decision', decisionSha256: sha('unknown') });
  const unknownCore = unknown.observations[0];
  assert.ok(unknownCore);
  unknownCore.observationSha256 = browserObservationSha256(unknownCore);
  assert.throws(() => validateBrowserObservationDecisionLinks({ browserObservations: unknown }, graphBytes(), true), code('UNKNOWN_DESIGN_DECISION'));

  const unbound = carrier();
  unbound.observations[0]?.decisionRefs.splice(0, 1, { decisionId: 'hero-strategy', decisionSha256: sha('unbound') });
  const unboundCore = unbound.observations[0];
  assert.ok(unboundCore);
  unboundCore.observationSha256 = browserObservationSha256(unboundCore);
  assert.throws(() => validateBrowserObservationDecisionLinks({ browserObservations: unbound }, graphBytes(), true), code('UNBOUND_DESIGN_DECISION'));

  assert.throws(() => validateBrowserObservationDecisionLinks(evidence(), graphBytes([decision(), decision()]), true), code('STALE_DECISION_GRAPH'));
  const mismatched = carrier();
  const first = mismatched.observations[0];
  assert.ok(first);
  first.observationSha256 = sha('mismatched-observation');
  assert.throws(() => validateBrowserObservationDecisionLinks({ browserObservations: mismatched }, graphBytes(), true), code('MISMATCHED_OBSERVATION_DIGEST'));
});

test('duplicate decision IDs fail distinctly when their exact graph bytes are bound', () => {
  const duplicateBytes = graphBytes([decision(), decision()]);
  const input = evidence();
  input.browserObservations.decisionGraphSha256 = sha(duplicateBytes);
  assert.throws(() => validateBrowserObservationDecisionLinks(input, duplicateBytes, true), code('DUPLICATE_DESIGN_DECISION_ID'));
});

test('malformed URL, state, viewport, result, reference, and duplicate references fail closed', () => {
  const malformed = [
    { ...core(), testedUrl: 'javascript:alert(1)' },
    { ...core(), testedState: 'not canonical state' },
    { ...core(), viewport: { width: 0, height: 844 } },
    { ...core(), observableResult: { ...core().observableResult, result: { measurement: 'viewport-pixels', width: 391, height: 844 } } },
    { ...core(), decisionRefs: [] },
    { ...core(), decisionRefs: [core().decisionRefs[0], core().decisionRefs[0]] },
  ];
  for (const observation of malformed) {
    assert.throws(() => validateBrowserObservationDecisionLinks({ browserObservations: { ...carrier(), observations: [{ ...observation, observationSha256: sha('irrelevant') }] } }, graphBytes(), true), code('MALFORMED_BROWSER_OBSERVATION'));
  }
});

test('hidden, Symbol, inherited, accessor, and proxy inputs fail without invoking getters', () => {
  let getterCalls = 0;
  const hidden = carrier();
  Object.defineProperty(hidden, 'hidden', { value: true });
  const symbol = carrier();
  Object.defineProperty(symbol, Symbol('authority'), { value: true, enumerable: true });
  const accessor = carrier();
  Object.defineProperty(accessor, 'observations', { get() { getterCalls += 1; return []; }, enumerable: true });
  const inherited = Object.create({ authority: true });
  Object.assign(inherited, carrier());
  const proxy = new Proxy(carrier(), { ownKeys() { throw new Error('hostile proxy'); } });
  for (const value of [hidden, symbol, accessor, inherited, proxy]) {
    assert.throws(() => validateBrowserObservationDecisionLinks({ browserObservations: value }, graphBytes(), true), code('MALFORMED_BROWSER_OBSERVATION'));
  }
  assert.equal(getterCalls, 0);
});

test('the observation-v2 writer persists only current measured browser-decision links', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-browser-links-'));
  try {
    mkdirSync(join(directory, '.omd', '.cache'), { recursive: true });
    const buildSha256 = sha('current-build');
    const buildBytes = Buffer.from(`${JSON.stringify({ buildSha256 })}\n`);
    writeFileSync(join(directory, '.omd', 'build.json'), buildBytes);
    const decisionBytes = graphBytes();
    writeFileSync(join(directory, '.omd', 'decision-graph.json'), decisionBytes);
    const measured = png(390, 844);
    writeFileSync(join(directory, '.omd', '.cache', 'hero-mobile.png'), measured);
    const observation = {
      ...core(), observableResult: { ...core().observableResult, capture: { path: '.omd/.cache/hero-mobile.png', sha256: sha(measured) } },
    };
    const browserObservations = {
      schema: BROWSER_OBSERVATION_SET_SCHEMA, decisionGraphSha256: sha(decisionBytes),
      observations: [{ ...observation, observationSha256: browserObservationSha256(observation) }],
    };
    const invocation = createTestProjectRunInvocation(directory, 'browser-observation-publication');
    const writer = createTestProjectWriteAdapter(directory, invocation);
    const written = writeObservationV2(directory, {
      currentArtifact: { path: '.omd/build.json', sha256: sha(buildBytes) }, buildSha256,
      observedAt: '2026-01-01T00:00:00.000Z', evidence: { browserObservations },
    }, writer, invocation);
    assert.deepEqual(written.evidence, { browserObservations });
    const pointerBefore = readFileSync(join(directory, '.omd', 'observation-v2.json'));
    writeFileSync(join(directory, '.omd', '.cache', 'hero-mobile.png'), Buffer.from('stale'));
    assert.throws(() => writeObservationV2(directory, {
      currentArtifact: { path: '.omd/build.json', sha256: sha(buildBytes) }, buildSha256,
      observedAt: '2026-01-01T00:01:00.000Z', evidence: { browserObservations },
    }, writer, invocation), code('STALE_OBSERVATION_ARTIFACT'));
    assert.deepEqual(readFileSync(join(directory, '.omd', 'observation-v2.json')), pointerBefore);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('parsed links detach and freeze mutable source input, and stale capture bytes fail', () => {
  const source = evidence();
  const parsed = validateBrowserObservationDecisionLinks(source, graphBytes(), true);
  assert.ok(parsed);
  const first = source.browserObservations.observations[0];
  assert.ok(first);
  first.testedState = 'mutated-after-parse';
  const firstRef = first.decisionRefs[0];
  assert.ok(firstRef);
  firstRef.decisionId = 'mutated-decision';
  assert.equal(parsed.observations[0]?.testedState, 'primary-action-visible');
  assert.equal(parsed.observations[0]?.decisionRefs[0]?.decisionId, 'hero-strategy');
  assert.throws(() => validateBrowserObservationArtifacts(parsed, () => Buffer.from('stale'), false), code('STALE_OBSERVATION_ARTIFACT'));
});

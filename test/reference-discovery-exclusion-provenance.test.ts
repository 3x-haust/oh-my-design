import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import { publishReferenceDiscoveryExclusion, readReferenceDiscoveryExclusions } from '../core/ref/discovery-exclusion.ts';
import { DISCOVERY_LIMITATIONS } from '../core/ref/discovery-record.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { testPng } from './helpers/search-execution.ts';

const source = 'https://example.com/task';
const contract = 'a'.repeat(64);
const reason = 'The observed page did not expose a useful application flow.';

function fixture(t: { after(fn: () => void): void }, signed: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-exclusion-provenance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = '.omd/discovery/domain/navigation';
  mkdirSync(join(root, directory), { recursive: true });
  const image = testPng();
  const imageSha256 = sha256(image);
  writeFileSync(join(root, directory, `${imageSha256}.png`), image);
  const schema = signed ? 'reference-navigation-capture-v3' : 'reference-navigation-capture-v2';
  const record = { schema, source, researchLane: 'domain', kind: 'page', capturedAt: new Date().toISOString(),
    imagePath: `${directory}/${imageSha256}.png`,
    acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [], imageSha256 },
    limitations: DISCOVERY_LIMITATIONS };
  const capture = signed
    ? { ...record, signature: signNativeObservation(root, schema, sha256(canonicalJson(record))) }
    : record;
  const bytes = `${JSON.stringify(capture, null, 2)}\n`;
  writeFileSync(join(root, directory, `${sha256(bytes)}.json`), bytes);
  return root;
}

test('an unsigned v2 visit cannot publish an exclusion', t => {
  const root = fixture(t, false);
  assert.throws(() => publishReferenceDiscoveryExclusion(root, contract, 'domain', source, reason,
    createTestProjectWriteAdapter(root)), /visit and capture/);
});

test('an existing exclusion backed by an unsigned v2 visit cannot suppress a source', t => {
  const root = fixture(t, false);
  const directory = '.omd/discovery/domain/navigation';
  const capture = readdirSync(join(root, directory)).find(name => name.endsWith('.json'));
  assert.ok(capture);
  const visit = { path: `${directory}/${capture}`, sha256: capture.slice(0, -5) };
  const decision = { schema: 'reference-discovery-exclusion-v1', sourceContractSha256: contract,
    researchLane: 'domain', source, reason, visit };
  const bytes = `${JSON.stringify(decision, null, 2)}\n`;
  const excluded = '.omd/discovery/domain/excluded';
  mkdirSync(join(root, excluded), { recursive: true });
  writeFileSync(join(root, excluded, `${sha256(bytes)}.json`), bytes);
  assert.deepEqual(readReferenceDiscoveryExclusions(root, contract), []);
});

test('a signed current v3 visit can publish and retain an exclusion', t => {
  const root = fixture(t, true);
  publishReferenceDiscoveryExclusion(root, contract, 'domain', source, reason,
    createTestProjectWriteAdapter(root));
  assert.equal(readReferenceDiscoveryExclusions(root, contract)[0]?.decision.source, source);
});

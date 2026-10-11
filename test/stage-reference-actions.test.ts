import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import type { AdaptiveRouteInput } from '../core/route/adaptive-flow-domain.ts';
import type { Reference } from '../core/types.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { publishSearchLeads, SEARCH_LEADS_SCHEMA } from '../core/ref/search-leads.ts';
import { fixture } from './helpers/discovery-work.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { testPng } from './helpers/search-execution.ts';
import { DOMAIN_OBSERVATION_SCHEMA, DOMAIN_OBSERVATION_LIMITATIONS } from '../core/ref/domain-observation.ts';
import { readStrictDiscoveryNavigation } from '../core/ref/discovery-record.ts';
import { stageDesignCandidate } from '../core/ref/reference-candidate.ts';
import { refImagePath } from '../core/ref/store.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { legacyReferenceDiscoveryWork } from '../core/ref/discovery-work.ts';

const pack = fileURLToPath(new URL('../core', import.meta.url));

function project(t: TestContext) {
  const root = fixture(t);
  const base: AdaptiveRouteInput = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  assert.ok(base.strategyDecision);
  const stages = ['domain', 'frame', 'acquisition', 'scout', 'reference-board', ...base.strategyDecision.stages.filter(s => s !== 'domain')] as const;
  const input = { ...base, referenceDiscovery: {
    schema: 'reference-discovery-input-v1' as const, taskNeed: 'existing-product-change' as const,
    uncertainty: 'unresolved' as const, existingEvidence: 'none' as const,
    intendedUse: 'Inspect confirmation work surfaces.', existingEvidenceUse: null, skipReason: null,
  }, strategyDecision: { ...base.strategyDecision, stages,
    methods: [...base.strategyDecision.methods, 'reference-discovery'],
    roles: ['omd-framer', 'omd-scout', ...base.strategyDecision.roles] as const,
    executionWaves: [
      { id: 'frame', mode: 'concurrent' as const, roles: ['omd-framer'] as const },
      { id: 'reference', mode: 'concurrent' as const, roles: ['omd-scout'] as const },
      ...base.strategyDecision.executionWaves,
    ],
    skips: base.strategyDecision.skips.filter(s => s.id !== 'reference-discovery' && !stages.some(stage => stage === s.id)),
  } };
  const invocation = publishTestAdaptiveRoute(root, input);
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  const evidence = [{ status: 'user-provided', reference: 'request' }];
  const statement = { text: base.request, userEvidence: [
    { kind: 'explicit-user-evidence', source: 'user-message', reference: 'request', excerpt: base.request },
  ] };
  writeFileSync(join(root, '.omd/domain-brief.json'), JSON.stringify({
    schema: 'domain-brief-v1', request: base.request, domain: 'Confirmation', summary: 'Read the confirmation record.',
    surfaces: [{ name: 'Confirmation', purpose: 'Read the record', evidence }],
    coreObjects: [{ name: 'Confirmation', evidence }], audience: { description: 'Existing users', evidence },
    referenceQueries: { component: ['confirmation'], craft: ['type'], mood: ['voice'] },
    planning: { businessGoal: statement, successSignal: statement, nonGoals: [statement] },
  }));
  writeFileSync(join(root, '.omd/frame.md'), `---
uxTask: Read the confirmation record
uxFrequentAction: Open the confirmation
uxCostliestError: Miss the confirmed result
uxSurface: product
---
## Task coverage matrix
T1 | goal: Read confirmation | start: confirmation | actions: open record | success: record visible | recovery: return to confirmation | viewports: desktop,mobile | requirements: none
`);
  const inputPath = join(root, '.omd/.cache/acquisition-plan.json');
  writeFileSync(inputPath, JSON.stringify({
    schema: 'reference-acquisition-plan-v2', owner: 'omd-framer', localeContextSha256: null, zones: [{
      id: 'hero', kind: 'region', required: true, job: 'Anchor the confirmation record.',
      decisionId: 'confirmation-hierarchy', question: 'How are the selected record and its next action grouped?',
      axes: ['structure'],
      requiredState: 'A selected record with its next action visible.',
      viewports: [{ width: 1440, height: 900 }], falsifier: 'The selected record or next action is obscured.',
    }],
  }));
  execFileSync(process.execPath, [fileURLToPath(new URL('../bin/omd.mjs', import.meta.url)),
    'acquisition', 'set', '--input', inputPath], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  writeFileSync(join(root, '.omd/scout.md'), '# Scoped reference observations\n');
  for (const source of ['https://one.example/task', 'https://two.example/task', 'https://three.example/task']) {
    const text = 'A confirmation workflow presents the current record and its next action.';
    const unsigned = { schema: DOMAIN_OBSERVATION_SCHEMA, source, researchLane: 'domain',
      method: 'direct-public', entry: 'public-directory', capturedAt: new Date().toISOString(),
      acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [source + '/details'] },
      observedText: text, taskText: text, linkLabels: [{ url: source + '/details', text: 'Read confirmation details' }],
      language: 'non-korean', limitations: DOMAIN_OBSERVATION_LIMITATIONS };
    const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
    const bytes = JSON.stringify(record);
    const directory = join(root, '.omd/discovery/domain/observations');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, sha256(bytes) + '.json'), bytes);
  }
  const source = 'https://example.com/task';
  const writer = createTestProjectWriteAdapter(root);
  publishSearchLeads(writer, readPersistedRoute(root, invocation).sourceContractSha256,
    { schema: SEARCH_LEADS_SCHEMA, lane: 'design', query: 'confirmation work screen',
      urls: [source], provider: 'host-web-search', tool: 'fixture-search', observedAt: new Date().toISOString() });
  return { root, invocation, source };
}

test('browse is the default while explicit legacy inspection preserves retention and review actions', t => {
  const { root, invocation, source } = project(t);
  const transport = nextStageWork(root, pack, invocation);
  assert.equal(transport.stage, 'reference-board');
  assert.equal(transport.referenceWork?.action?.kind, 'start-browse');
  assert.equal(transport.action, 'acquire-reference');
  const route = readPersistedRoute(root, invocation);
  assert.equal(legacyReferenceDiscoveryWork(root, route).action?.kind, 'follow-link');
  const directory = join(root, '.omd/discovery/design/navigation');
  mkdirSync(directory, { recursive: true });
  const image = testPng(1280, 900);
  const imagePath = '.omd/discovery/design/navigation/' + sha256(image) + '.png';
  const screenshot = join(root, imagePath);
  writeFileSync(screenshot, image);
  const unsigned = { schema: 'reference-navigation-capture-v5', source,
    researchLane: 'design', kind: 'page', capturedAt: new Date().toISOString(),
    imagePath,
    acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [], imageSha256: sha256(image) },
    imageCandidates: [{ selector: '#screen', width: 640, height: 450, naturalWidth: 1280, naturalHeight: 900 }],
    limitations: 'native-public-get; stable-rendered-viewport-links; no-authentication; no-interaction-probes; not-provider-attested' };
  const bytes = JSON.stringify({ ...unsigned,
    signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) });
  const capturePath = '.omd/discovery/design/navigation/' + sha256(bytes) + '.json';
  writeFileSync(join(root, capturePath), bytes);
  assert.equal(readStrictDiscoveryNavigation(root, { url: source,
    evidence: { path: imagePath, sha256: sha256(image) },
    capture: { path: capturePath, sha256: sha256(bytes) } }).url, source);
  const retention = legacyReferenceDiscoveryWork(root, route);
  assert.equal(retention.action?.kind, 'retain-reference');
  assert.notEqual(retention.next, 'omd ref advance --json');
  const baseline = designAdmissionFixture(t).source.ref;
  const candidate: Reference = { ...baseline, source, component: 'confirmation', selector: '#screen',
    capturedAt: new Date().toISOString(),
    blueprint: { selector: '#screen', capturedAt: new Date().toISOString(),
      nodes: [{ id: 'screen', role: 'container', children: [], box: { w: 640, h: 450 } }] },
    acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [], imageSha256: sha256(image) },
  };
  stageDesignCandidate(root, { ...candidate,
    imagePath: relative(root, refImagePath(root, candidate)) }, image, createTestProjectWriteAdapter(root));
  const review = legacyReferenceDiscoveryWork(root, route);
  assert.equal(review.action?.kind, 'review-candidates');
  assert.equal(review.next, 'omd ref direction-review --json');
});

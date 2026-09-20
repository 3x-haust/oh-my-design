import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { refIdentity } from '../core/ref/identity.ts';
import {
  parseReferenceResearch,
  validateReferenceResearch,
  publishReferenceResearch,
  readPublishedReferenceResearch,
  DOMAIN_REFERENCES_PATH,
  DESIGN_REFERENCES_PATH,
} from '../core/ref/reference-research.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import omdExtension, { type PortablePiTool } from '../extensions/omd.ts';
import { checkReferenceApplication, parseReferenceApplication, publishReferenceApplication, referenceApplicationPlan,
  REFERENCE_APPLICATION_DOC_PATH, REFERENCE_APPLICATION_PATH, REFERENCE_APPLICATION_PROJECTION_PATH } from '../core/ref/reference-application.ts';
import { buildBrief, formatBrief } from '../core/brief/index.ts';
import { createTestProjectRunInvocation, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { selectReferenceCandidateV2 } from '../core/ref/reference-selection.ts';
import { writeReferenceHandoffReceipt } from '../core/ref/reference-handoff.ts';
import { readSelectedReferenceHandoff } from '../core/ref/selected-handoff.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';
import { validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { stageArtifactProblems } from '../core/stage/output.ts';

const SOURCE_SHA = 'a'.repeat(64);
const digest = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
const domainPng = () => {
  const chunk = (type: string, bytes: Buffer) => {
    const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
    const body = Buffer.concat([Buffer.from(type), bytes]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([PNG.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3]))), chunk('IEND', Buffer.alloc(0))]);
};

function domainBrief(request = 'Study the service') {
  const evidence = [{ status: 'user-provided', reference: 'test-request' }];
  return { schema: 'domain-brief-v1', request, domain: 'service', summary: 'Service preparation workspace',
    surfaces: ['home', 'detail'].map(name => ({ name, purpose: `Complete the ${name} task`, evidence })),
    coreObjects: [{ name: 'request', evidence }], audience: { description: 'service applicants', evidence },
    referenceQueries: { component: ['task list'], craft: ['feedback transition'], mood: ['focused workspace'] },
    planning: { businessGoal: { text: 'Reduce preparation effort' }, successSignal: { text: 'Complete a request' }, nonGoals: [{ text: 'No official submissions' }] } };
}

function filledApplication(root: string, options: { expectedSourceContractSha256: string; benchmarkRequired: boolean }) {
  const draft = referenceApplicationPlan(root, options).input;
  return { ...draft, screens: draft.screens.map((row, index) => ({ ...row,
    target: { route: `/${row.surface}`, state: 'initial' },
    domain: { referenceIds: ['domain-a'], coverage: 'direct', gap: null,
      application: index === 0 ? 'Show unfinished preparation before starting another request.' : 'Separate saved preparation from official submission.',
      doNotTransfer: 'Do not imply official receipt from local saving.', reason: 'The task requires preparation without institutional integration.' },
    design: { referenceIds: ['design-a'], coverage: 'partial', gap: 'Only static hierarchy is observed; mobile errors need local testing.',
      application: index === 0 ? 'Make the unfinished request the dominant object.' : 'Keep the title and supporting requirements in one visual group.',
      doNotTransfer: 'Do not copy source branding or artwork.', reason: 'A clear work-object hierarchy supports the destination task.' },
    checks: [`${row.surface}: primary task remains visible with a long Korean title.`],
  })) };
}

function applicationFixture(t: { after(fn: () => void): void }) {
  const value = fixture(t);
  const options = { expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false };
  const writer = createTestProjectWriteAdapter(value.root);
  publishReferenceResearch(value.root, value.research, options, writer);
  writeFileSync(join(value.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief()));
  return { ...value, options, writer, application: filledApplication(value.root, options) };
}

function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-reference-research-')));
  mkdirSync(join(root, '.omd', 'refs'), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  const source = 'https://design.example/reference';
  const component = 'hero';
  const imagePath = refImagePath(root, { source, component, researchLane: 'design' });
  const invariants: Invariants = {
    spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1,
    paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [],
    easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [],
    hasReducedMotion: false, scrollChoreography: [],
  };
  const blueprint: Blueprint = {
    selector: '#hero', capturedAt: '2026-09-19T00:00:00.000Z',
    nodes: [{ id: 'hero', role: 'container', children: [], box: { w: 120, h: 40 } }],
  };
  const reference: Reference = {
    researchLane: 'design', acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [], imageSha256: digest(PNG) },
    source, component, kind: 'component', capturedAt: '2026-09-19T00:00:00.000Z', selector: '#hero',
    invariants, principles: ['Keep the hierarchy independent.'], blueprint, imagePath: relative(root, imagePath),
  };
  const capturePath = saveRef(root, reference, writer);
  writeFileSync(imagePath, PNG);
  const gallerySource = 'https://www.pinterest.com/pin/123456789/';
  const galleryImage = refImagePath(root, { source: gallerySource, component: 'entry', researchLane: 'design' });
  const galleryCapture = saveRef(root, { ...reference, source: gallerySource, component: 'entry', imagePath: relative(root, galleryImage), acquisition: { requestedUrl: gallerySource, finalUrl: gallerySource, httpStatus: 200, links: [source], imageSha256: digest(PNG) } }, writer);
  writeFileSync(galleryImage, PNG);
  const receipt = (path: string) => ({ path: relative(root, path), sha256: digest(readFileSync(path)) });
  const board = {
    schemaVersion: 'reference-board-v1', frameSha256: 'b'.repeat(64),
    candidates: [{
      id: 'candidate', label: 'Candidate', route: '/', rationale: 'Measured visual direction.',
      pieces: [{
        slotId: 'hero', sourceKind: 'component-capture', referenceId: refIdentity(source, component),
        targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use hierarchy.',
        take: ['structure'], avoid: 'Do not copy source content.', adaptation: 'Use local tokens.',
        evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' },
        grid: { column: 1, span: 12, order: 0 },
      }],
    }],
  };
  const boardPath = join(root, '.omd', 'reference-board.json');
  writeFileSync(boardPath, JSON.stringify(board));
  const domainPath = refImagePath(root, { source: 'https://domain.example/service', component: 'entry', researchLane: 'domain' });
  const domainCapture = saveRef(root, { ...reference, source: 'https://domain.example/service', component: 'entry', researchLane: 'domain', imagePath: relative(root, domainPath), acquisition: { requestedUrl: 'https://domain.example/service', finalUrl: 'https://domain.example/service', httpStatus: 200, links: [], imageSha256: digest(domainPng()) } }, writer);
  writeFileSync(domainPath, domainPng());
  const research = {
    schema: 'reference-research-v5',
    sourceContractSha256: SOURCE_SHA,
    domainReference: {
      queries: ['field service request flow'],
      searches: [testSearchReceipt(root, 'domain', 'field service request flow', ['https://domain.example/service'])],
      sources: [{
        id: 'domain-a', url: 'https://domain.example/service', observedAt: '2026-09-19',
        decision: 'request review sequence', finding: 'review precedes commitment',
        evidence: receipt(domainPath), capture: receipt(domainCapture),
      }],
      benchmarkSha256: null,
    },
    designReference: {
      queries: ['editorial hierarchy service landing'],
      searches: [testSearchReceipt(root, 'design', 'editorial hierarchy service landing', [gallerySource])],
      sources: [{
        id: 'design-a', url: source, observedAt: '2026-09-19',
        decision: 'hero hierarchy', finding: 'display and proof stay in one measured group',
        visualRole: 'visual-direction',
        visualAssessment: { composition: 'Single anchored work object', typography: 'Clear heading/body contrast', density: 'Compact controls with section space', imagery: 'No decorative image', transfer: 'Adapt the work-object hierarchy', avoid: 'Do not copy brand colours or service claims' },
        evidence: { path: relative(root, imagePath), sha256: digest(PNG) },
        capture: receipt(capturePath),
        discovery: { url: gallerySource, kind: 'app-gallery', access: 'free', qualityReason: 'The compact task heading and readable type suit the target viewport.', evidence: receipt(galleryImage), capture: receipt(galleryCapture) },
      }],
      boardSha256: sha256(readFileSync(boardPath)),
    },
  };
  return { root, research, boardPath };
}

test('two-track reference research binds separate live evidence and the current design board', t => {
  const value = fixture(t);
  const parsed = parseReferenceResearch(value.research);
  assert.doesNotThrow(() => validateReferenceResearch(value.root, parsed, {
    expectedSourceContractSha256: SOURCE_SHA,
    benchmarkRequired: false,
  }));
  writeFileSync(value.boardPath, `${readFileSync(value.boardPath, 'utf8')}\n`);
  assert.throws(() => validateReferenceResearch(value.root, parsed, {
    expectedSourceContractSha256: SOURCE_SHA,
    benchmarkRequired: false,
  }), /REFERENCE_RESEARCH_BOARD_STALE/);
});

test('gallery similarity hops require native current captures rooted in a real search receipt', t => {
  const { root, research } = fixture(t);
  const writer = createTestProjectWriteAdapter(root);
  const retained = research.designReference.sources[0]!.discovery;
  const start = 'https://www.pinterest.com/pin/111111111/';
  const metadata = JSON.parse(readFileSync(join(root, retained.capture.path), 'utf8'));
  const png = refImagePath(root, { source: start, component: 'entry', researchLane: 'design' });
  writeFileSync(png, PNG);
  const capture = saveRef(root, { ...metadata, source: start, imagePath: relative(root, png), acquisition: { requestedUrl: start, finalUrl: start, httpStatus: 200, links: [retained.url], imageSha256: digest(PNG) } }, writer);
  const hop = { url: start, evidence: { path: relative(root, png), sha256: digest(PNG) }, capture: { path: relative(root, capture), sha256: digest(readFileSync(capture)) } };
  const input = { ...research, designReference: { ...research.designReference, searches: [testSearchReceipt(root, 'design', research.designReference.queries[0]!, [start])], navigation: [hop] } };
  const options = { expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false };
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(input), options));
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch({ ...input, designReference: { ...input.designReference, navigation: [] } }), options), /not an observed search link/);
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch({ ...input, designReference: { ...input.designReference, navigation: [{ ...hop, capture: { ...hop.capture, sha256: '0'.repeat(64) } }] } }), options), /EVIDENCE_STALE/);
  const wrongLane = { ...input, designReference: { ...input.designReference, navigation: [{ ...hop, evidence: research.domainReference.sources[0]!.evidence }] } };
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(wrongLane), options), /LANE_PATH_REQUIRED/);
});

test('one capture cannot stand in for both domain and design research', t => {
  const value = fixture(t);
  value.research.designReference.sources[0]!.evidence = value.research.domainReference.sources[0]!.evidence;
  assert.throws(() => parseReferenceResearch(value.research), /REFERENCE_RESEARCH_LANE_EVIDENCE_REUSED/);
});

test('renaming identical bytes cannot turn domain evidence into design research', t => {
  const { research } = fixture(t);
  research.designReference.sources[0]!.evidence.sha256 = research.domainReference.sources[0]!.evidence.sha256;
  assert.throws(() => parseReferenceResearch(research), /REFERENCE_RESEARCH_LANE_EVIDENCE_REUSED/);
});

test('reusing a path with a different digest is also rejected', t => {
  const { research } = fixture(t);
  research.designReference.sources[0]!.evidence.path = research.domainReference.sources[0]!.evidence.path;
  assert.throws(() => parseReferenceResearch(research), /REFERENCE_RESEARCH_LANE_EVIDENCE_REUSED/);
});

test('design discovery requires free inspectable provenance and a specific quality reason', t => {
  const { research } = fixture(t);
  for (const kind of ['app-gallery', 'web-gallery', 'visual-bookmark', 'user-provided']) {
    research.designReference.sources[0]!.discovery.kind = kind;
    assert.doesNotThrow(() => parseReferenceResearch(research));
  }
  research.designReference.sources[0]!.discovery.access = 'paid';
  assert.throws(() => parseReferenceResearch(research), /FREE_ACCESS_REQUIRED/);
  research.designReference.sources[0]!.discovery.access = 'free';
  research.designReference.sources[0]!.discovery.qualityReason = ' ';
  assert.throws(() => parseReferenceResearch(research), /QUALITY_REASON/);
  const missing = JSON.parse(JSON.stringify(research));
  delete missing.designReference.sources[0].discovery;
  assert.throws(() => parseReferenceResearch(missing), /SOURCE_KEYS/);
});

test('v1 requires honest recollection and republication, never fabricated gallery provenance', t => {
  const { research } = fixture(t);
  research.schema = 'reference-research-v1';
  assert.throws(() => parseReferenceResearch(research), /UPGRADE_REQUIRED.*republish/);
});

test('v3 needs explicit visual role review, not automatic approval of existing captures', t => {
  const { research } = fixture(t);
  research.schema = 'reference-research-v3';
  assert.throws(() => parseReferenceResearch(research), /UPGRADE_REQUIRED/);
});

test('a service page cannot label itself a free gallery entry', t => {
  const { research } = fixture(t);
  research.designReference.sources[0]!.discovery.url = 'https://www.gov.uk/check-benefits-financial-support';
  assert.throws(() => parseReferenceResearch(research), /DISCOVERY_PROVIDER/);
  research.designReference.sources[0]!.discovery.url = 'https://pinterest.com.evil.example/pin/123/';
  assert.throws(() => parseReferenceResearch(research), /DISCOVERY_PROVIDER/);
  research.designReference.sources[0]!.discovery.url = 'https://dribbble.com/shots/2425231-Mobile-app-dashboard';
  assert.doesNotThrow(() => parseReferenceResearch(research));
});

test('test-010 regression: different crops/pages of the domain service do not become design research', t => {
  const { research } = fixture(t);
  for (const url of ['https://domain.example/service', 'https://www.domain.example/other-page?crop=calm#design']) {
    research.designReference.sources[0]!.url = url;
    assert.throws(() => parseReferenceResearch(research), /DOMAIN_AS_VISUAL_DIRECTION/);
  }
});

test('support-only design research and absent visual observations fail; recorded absence of imagery is valid', t => {
  const { research } = fixture(t);
  const source = research.designReference.sources[0]!;
  source.visualRole = 'component-support';
  assert.throws(() => parseReferenceResearch(research), /VISUAL_DIRECTION_REQUIRED/);
  source.visualRole = 'visual-direction';
  source.visualAssessment.typography = '';
  assert.throws(() => parseReferenceResearch(research), /VISUAL_TYPOGRAPHY/);
  source.visualAssessment.typography = 'Large title contrasts with compact labels';
  assert.doesNotThrow(() => parseReferenceResearch(research));
});

test('board candidates cannot use only support evidence while visual direction sits unused', t => {
  const { root, research } = fixture(t);
  const source = research.designReference.sources[0]!;
  source.visualRole = 'component-support';
  research.designReference.sources.push({ ...source, id: 'direction-b', visualRole: 'visual-direction',
    url: source.discovery.url, evidence: source.discovery.evidence, capture: source.discovery.capture });
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), {
    expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false,
  }), /BOARD_DESIGN_COVERAGE/);
});

test('redirecting a gallery capture back to the domain cannot defeat lane isolation', t => {
  const { root, research } = fixture(t);
  const receipt = research.designReference.sources[0]!.discovery.capture;
  const path = join(root, receipt.path);
  const capture = JSON.parse(readFileSync(path, 'utf8'));
  capture.acquisition.finalUrl = research.domainReference.sources[0]!.url;
  writeFileSync(path, JSON.stringify(capture));
  receipt.sha256 = sha256(readFileSync(path));
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), {
    expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false,
  }), /LANE_REDIRECT_OVERLAP/);
});

test('test-009 regression: a gallery homepage cannot masquerade as an inspected design item', t => {
  const { research } = fixture(t);
  for (const url of ['https://uibowl.io/', 'https://uibowl.io/landing', 'https://www.pinterest.com/search/pins/?q=dashboard']) {
    research.designReference.sources[0]!.discovery.url = url;
    assert.throws(() => parseReferenceResearch(research), /DISCOVERY_ENTRY_REQUIRED/);
  }
});

test('test-009 regression: Carbon capture cannot substantiate a GOV.UK source claim', t => {
  const { root, research } = fixture(t);
  research.designReference.sources[0]!.url = 'https://design-system.service.gov.uk/components/error-message/';
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), {
    expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false,
  }), /CAPTURE_SOURCE_MISMATCH/);
});

test('gallery and original-source captures need an observed link, not two unrelated screenshots', t => {
  const { root, research } = fixture(t);
  const capture = research.designReference.sources[0]!.discovery.capture;
  const path = join(root, capture.path);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.acquisition.links = ['https://unrelated.example/'];
  writeFileSync(path, JSON.stringify(record));
  capture.sha256 = digest(readFileSync(path));
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), {
    expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false,
  }), /DISCOVERY_LINK_MISMATCH/);
});

test('collecting gallery evidence without using it in any board candidate cannot complete design research', t => {
  const { root, research } = fixture(t);
  const source = research.designReference.sources[0]!;
  source.url = source.discovery.url;
  source.evidence = source.discovery.evidence;
  source.capture = source.discovery.capture;
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), {
    expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false,
  }), /BOARD_DESIGN_COVERAGE/);
});

test('lane-swapped PNG paths and failed acquisitions are rejected', t => {
  const { root, research } = fixture(t);
  const options = { expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false };
  const wrongLane = structuredClone(research);
  wrongLane.domainReference.sources[0]!.evidence.path = '.omd/refs/design/not-domain.png';
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(wrongLane), options), /LANE_PATH_REQUIRED/);
  const capture = research.domainReference.sources[0]!.capture;
  const path = join(root, capture.path);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.acquisition.httpStatus = 404;
  writeFileSync(path, JSON.stringify(record)); capture.sha256 = digest(readFileSync(path));
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), options), /ACQUISITION_INVALID/);
});

test('capture metadata is hashed and cannot be swapped through a symlink', t => {
  const { root, research } = fixture(t);
  const path = join(root, research.domainReference.sources[0]!.capture.path);
  const backup = `${path}.backup`;
  writeFileSync(backup, readFileSync(path)); rmSync(path); symlinkSync(backup, path);
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), {
    expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false,
  }), /EVIDENCE_MISSING/);
});

test('changing a PNG and rehashing the ledger cannot replace the bytes bound at capture time', t => {
  const { root, research } = fixture(t);
  const source = research.domainReference.sources[0]!;
  // A valid PNG with different pixels, not cross-lane duplicate evidence.
  const changed = Buffer.from(domainPng());
  // Use a second native fixture screenshot with different pixels, kept away from design evidence.
  const first = changed.indexOf(Buffer.from('IDAT'));
  const bodyLength = changed.readUInt32BE(first - 4);
  const data = deflateSync(Buffer.from([0, 5, 6, 7]));
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from('IDAT'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  const png = Buffer.concat([changed.subarray(0, first - 4), length, body, crc, changed.subarray(first + 4 + bodyLength + 4)]);
  writeFileSync(join(root, source.evidence.path), png); source.evidence.sha256 = digest(png);
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), {
    expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false,
  }), /CAPTURE_IMAGE_MISMATCH/);
});

test('publisher saves two separate files and readers reject missing or mismatched lanes', t => {
  const { root, research } = fixture(t);
  const writer = createTestProjectWriteAdapter(root);
  const options = { expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false };
  publishReferenceResearch(root, research, options, writer);
  assert.deepEqual(readPublishedReferenceResearch(root), parseReferenceResearch(research));
  const domain = JSON.parse(readFileSync(join(root, DOMAIN_REFERENCES_PATH), 'utf8'));
  const design = JSON.parse(readFileSync(join(root, DESIGN_REFERENCES_PATH), 'utf8'));
  assert.equal(domain.schema, 'domain-references-v1');
  assert.equal(design.schema, 'design-references-v1');
  assert.equal(domain.sources[0].id, 'domain-a');
  assert.equal(design.sources[0].id, 'design-a');
  assert.equal(domain.boardSha256, undefined);
  assert.equal(design.benchmarkSha256, undefined);
  // Serialization order alone does not invalidate evidence.
  writeFileSync(join(root, DESIGN_REFERENCES_PATH), JSON.stringify(Object.fromEntries(Object.entries(design).reverse())));
  assert.doesNotThrow(() => readPublishedReferenceResearch(root));
  design.sources[0].finding = 'unpublished change';
  writeFileSync(join(root, DESIGN_REFERENCES_PATH), JSON.stringify(design));
  assert.throws(() => readPublishedReferenceResearch(root), /LANE_STALE/);
  publishReferenceResearch(root, research, options, writer);
  rmSync(join(root, DOMAIN_REFERENCES_PATH));
  assert.throws(() => readPublishedReferenceResearch(root), /LANE_MISSING/);
});

test('invalid publication cannot replace the current separate records', t => {
  const { root, research } = fixture(t);
  const writer = createTestProjectWriteAdapter(root);
  const options = { expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false };
  publishReferenceResearch(root, research, options, writer);
  const before = readFileSync(join(root, DESIGN_REFERENCES_PATH), 'utf8');
  research.designReference.sources[0]!.evidence.sha256 = '0'.repeat(64);
  assert.throws(() => publishReferenceResearch(root, research, options, writer), /EVIDENCE_STALE/);
  assert.equal(readFileSync(join(root, DESIGN_REFERENCES_PATH), 'utf8'), before);
});

test('interrupted split publication cannot be read as a completed new research set', t => {
  const { root, research } = fixture(t);
  const writer = createTestProjectWriteAdapter(root);
  const options = { expectedSourceContractSha256: SOURCE_SHA, benchmarkRequired: false };
  publishReferenceResearch(root, research, options, writer);
  research.domainReference.queries.push('another observed task query');
  research.domainReference.searches.push(testSearchReceipt(root, 'domain', 'another observed task query', ['https://domain.example/service']));
  const interrupted = { ...writer, write(path: string, content: string | Uint8Array) {
    if (path === DESIGN_REFERENCES_PATH) throw new Error('simulated interruption');
    return writer.write(path, content);
  } };
  assert.throws(() => publishReferenceResearch(root, research, options, interrupted), /simulated interruption/);
  assert.throws(() => readPublishedReferenceResearch(root), /LANE_STALE/);
  publishReferenceResearch(root, research, options, writer);
  assert.deepEqual(readPublishedReferenceResearch(root), parseReferenceResearch(research));
});

test('a board cannot advance past research until separate current lanes and application are published', t => {
  const { root, research } = fixture(t);
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  const invocation = publishTestAdaptiveRoute(root, input);
  const route = readPersistedRoute(root, invocation);
  const options = { expectedSourceContractSha256: route.sourceContractSha256, benchmarkRequired: false };
  const writer = createTestProjectWriteAdapter(root, invocation);
  research.sourceContractSha256 = route.sourceContractSha256;
  assert.ok(stageArtifactProblems(root, 'reference-board', invocation).length > 0);
  publishReferenceResearch(root, research, options, writer);
  writeFileSync(join(root, '.omd/domain-brief.json'), JSON.stringify(domainBrief(route.request)));
  assert.ok(stageArtifactProblems(root, 'reference-board', invocation).length > 0);
  publishReferenceApplication(root, filledApplication(root, options), options, writer);
  assert.deepEqual(stageArtifactProblems(root, 'reference-board', invocation), []);
  rmSync(join(root, DESIGN_REFERENCES_PATH));
  assert.ok(stageArtifactProblems(root, 'reference-board', invocation).length > 0);
});

test('Pi CLI publishes and checks split research without an external activation', async t => {
  const { root, research } = fixture(t);
  const routeInput = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  writeFileSync(join(root, '.omd/route-input.json'), JSON.stringify(routeInput));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  let tool!: PortablePiTool;
  omdExtension({
    registerCommand() {}, registerTool(value) { tool = value; },
    async exec(_command, args, options) {
      const result = spawnSync(process.execPath, [...args], { cwd: options.cwd, encoding: 'utf8', env, timeout: 20000 });
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1, killed: result.signal !== null };
    },
  });
  const run = (args: string[]) => tool.execute('test', { args }, undefined, undefined, { cwd: root });
  await run(['route', 'classify', '--input', '.omd/route-input.json', '--json']);
  const route = JSON.parse((await run(['route', 'show', '--json'])).content[0]!.text);
  research.sourceContractSha256 = route.sourceContractSha256;
  writeFileSync(join(root, '.omd/research-input.json'), JSON.stringify(research));
  const result = JSON.parse((await run(['ref', 'research-set', '--input', '.omd/research-input.json', '--json'])).content[0]!.text);
  assert.equal(result.domainPath, DOMAIN_REFERENCES_PATH);
  assert.equal(result.designPath, DESIGN_REFERENCES_PATH);
  assert.equal(JSON.parse((await run(['ref', 'research-check', '--json'])).content[0]!.text).domainSources, 1);
  const domainInventory = JSON.parse((await run(['ref', 'list', '--lane', 'domain', '--json'])).content[0]!.text);
  const designInventory = JSON.parse((await run(['ref', 'list', '--lane', 'design', '--json'])).content[0]!.text);
  assert.equal(domainInventory.length, 1);
  assert.equal(designInventory.length, 2);
  assert.ok(domainInventory.every((item: Reference) => item.researchLane === 'domain'));
  assert.ok(designInventory.every((item: Reference) => item.researchLane === 'design'));
  writeFileSync(join(root, '.omd/domain-brief.json'), JSON.stringify(domainBrief(route.request)));
  const plan = JSON.parse((await run(['ref', 'apply-plan', '--json'])).content[0]!.text);
  assert.deepEqual(plan.input.screens.map((row: { surface: string }) => row.surface), ['home', 'detail']);
  writeFileSync(join(root, '.omd/application-input.json'), JSON.stringify(filledApplication(root, {
    expectedSourceContractSha256: route.sourceContractSha256, benchmarkRequired: false,
  })));
  const application = JSON.parse((await run(['ref', 'apply-set', '--input', '.omd/application-input.json', '--json'])).content[0]!.text);
  assert.equal(application.screens, 2);
  const projection = JSON.parse((await run(['ref', 'apply-check', '--json'])).content[0]!.text);
  assert.equal(projection.screens[0].domain.coverage, 'direct');
  assert.equal(projection.screens[0].design.coverage, 'partial');
  assert.equal('referenceIds' in projection.screens[0].design, false);
  rmSync(join(root, DESIGN_REFERENCES_PATH));
  await assert.rejects(() => run(['ref', 'research-check', '--json']), /LANE_MISSING/);
});

test('application draft uses current surfaces and real inputs but cannot invent passing judgments', t => {
  const { root, options } = applicationFixture(t);
  const plan = referenceApplicationPlan(root, options);
  assert.deepEqual(plan.input.screens.map(row => row.surface), ['home', 'detail']);
  assert.equal(plan.evidence.design[0]!.id, 'design-a');
  assert.throws(() => parseReferenceApplication(plan.input), /referenceIds|gap|target.route/);
});

test('application validates separate screen decisions and publishes an inspectable source-free projection', t => {
  const { root, options, writer, application } = applicationFixture(t);
  publishReferenceApplication(root, application, options, writer);
  const projection = checkReferenceApplication(root, options);
  assert.equal(projection.screens[0]!.domain.application, application.screens[0]!.domain.application);
  assert.notEqual(projection.screens[0]!.design.application, projection.screens[1]!.design.application);
  assert.doesNotMatch(JSON.stringify(projection), /referenceIds|domain-a|design-a|https:|\.omd\/refs/);
  assert.match(readFileSync(join(root, REFERENCE_APPLICATION_DOC_PATH), 'utf8'), /home[\s\S]*detail/);
  assert.match(readFileSync(join(root, REFERENCE_APPLICATION_DOC_PATH), 'utf8'), /not proof/);
});

test('missing surfaces, wrong-lane references, empty reasons and unsupported direct coverage fail closed', t => {
  const f = applicationFixture(t);
  const publish = (value: unknown) => publishReferenceApplication(f.root, value, f.options, f.writer);
  const missing = structuredClone(f.application); missing.screens.pop();
  assert.throws(() => publish(missing), /every current domain surface/);
  const wrong = structuredClone(f.application); wrong.screens[0]!.design.referenceIds = ['domain-a'];
  assert.throws(() => publish(wrong), /wrong-lane/);
  const empty = structuredClone(f.application); empty.screens[0]!.domain.reason = '';
  assert.throws(() => publish(empty), /reason/);
  const noGap = structuredClone(f.application); noGap.screens[0]!.design.gap = '';
  assert.throws(() => publish(noGap), /gap/);
  const noChecks = structuredClone(f.application); noChecks.screens[0]!.checks = [];
  assert.throws(() => publish(noChecks), /checks/);
  const duplicate = structuredClone(f.application); duplicate.screens[1]!.surface = 'home';
  assert.throws(() => publish(duplicate), /duplicate surface/);
  f.research.designReference.sources.push({ ...f.research.designReference.sources[0]!, id: 'design-support', visualRole: 'component-support' });
  publishReferenceResearch(f.root, f.research, f.options, f.writer);
  const support = filledApplication(f.root, f.options);
  support.screens[0]!.design.referenceIds = ['design-support'];
  support.screens[0]!.design.coverage = 'direct';
  assert.throws(() => publish({ ...support, screens: support.screens.map((row, index) => index === 0 ? { ...row, design: { ...row.design, gap: null } } : row) }), /support-only/);
});

test('a brief-derived gap is allowed per screen but cannot replace both collected research lanes', t => {
  const f = applicationFixture(t);
  const derived = { referenceIds: [], coverage: 'brief-derived', gap: 'No comparable detail view was accessible.',
    application: 'Keep the brief-required review action next to its summary.', doNotTransfer: 'No unobserved service behavior.',
    reason: 'The brief explicitly requires a review summary.' };
  const value = structuredClone(f.application);
  const input = { ...value, screens: value.screens.map((row, index) => index === 1 ? { ...row, domain: derived, design: derived } : row) };
  assert.doesNotThrow(() => publishReferenceApplication(f.root, input, f.options, f.writer));
  assert.throws(() => publishReferenceApplication(f.root, { ...input, screens: input.screens.map(row => ({ ...row, design: derived })) }, f.options, f.writer), /collected research must inform/);
});

test('changed research, domain scope, source images and derived documents invalidate application', t => {
  const f = applicationFixture(t);
  publishReferenceApplication(f.root, f.application, f.options, f.writer);
  for (const path of [REFERENCE_APPLICATION_DOC_PATH, REFERENCE_APPLICATION_PROJECTION_PATH, '.omd/domain-brief.json', f.research.designReference.sources[0]!.evidence.path]) {
    const original = readFileSync(join(f.root, path));
    writeFileSync(join(f.root, path), Buffer.concat([original, Buffer.from('\n')]));
    assert.throws(() => checkReferenceApplication(f.root, f.options), /stale|changed|EVIDENCE/);
    writeFileSync(join(f.root, path), original);
  }
  f.research.designReference.sources[0]!.visualAssessment.transfer = 'A revised visual interpretation';
  publishReferenceResearch(f.root, f.research, f.options, f.writer);
  assert.throws(() => checkReferenceApplication(f.root, f.options), /binding is stale/);
});

test('source identities cannot be smuggled through downstream decision prose', t => {
  const f = applicationFixture(t);
  for (const leak of ['https://design.example/reference', 'design.example', '.omd/refs/design/private.png']) {
    const value = structuredClone(f.application); value.screens[0]!.design.application = `Copy ${leak}`;
    assert.throws(() => publishReferenceApplication(f.root, value, f.options, f.writer), /source.*(?:prose|hostnames)|capture paths/);
  }
});

test('interrupted application publication and mismatched requests cannot pass', t => {
  const f = applicationFixture(t);
  publishReferenceApplication(f.root, f.application, f.options, f.writer);
  const changed = structuredClone(f.application); changed.screens[0]!.design.application = 'Group the request summary above secondary tools.';
  const interrupted = { ...f.writer, write(path: string, content: string | Buffer) {
    if (path === REFERENCE_APPLICATION_PATH) throw new Error('simulated application interruption');
    return f.writer.write(path, content);
  } };
  assert.throws(() => publishReferenceApplication(f.root, changed, f.options, interrupted), /simulated/);
  assert.throws(() => checkReferenceApplication(f.root, f.options), /publication/);
  publishReferenceApplication(f.root, changed, f.options, f.writer);
  assert.doesNotThrow(() => checkReferenceApplication(f.root, f.options));
  assert.throws(() => checkReferenceApplication(f.root, { ...f.options, expectedRequest: 'Another request' }), /another request/);
});

test('production briefs require the current application and deliver decisions without capture identities', t => {
  const f = fixture(t);
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  const invocation = publishTestAdaptiveRoute(f.root, input);
  const route = readPersistedRoute(f.root, invocation);
  const options = { expectedSourceContractSha256: route.sourceContractSha256, benchmarkRequired: false };
  const writer = createTestProjectWriteAdapter(f.root, invocation);
  f.research.sourceContractSha256 = route.sourceContractSha256;
  publishReferenceResearch(f.root, f.research, options, writer);
  writeFileSync(join(f.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief(route.request)));
  assert.ok(buildBrief(f.root, 'composition', undefined, invocation).blockers.some(blocker => blocker.includes('apply-check')));
  publishReferenceApplication(f.root, filledApplication(f.root, options), options, writer);
  for (const stage of ['composition', 'candidate-generation', 'production'] as const) {
    const brief = buildBrief(f.root, stage, undefined, invocation);
    assert.equal(brief.referenceApplication?.screens.length, 2);
    assert.ok(!brief.blockers.some(blocker => blocker.includes('apply-check')));
    assert.match(formatBrief(brief), /unfinished request the dominant object/);
  }
  rmSync(join(f.root, REFERENCE_APPLICATION_PROJECTION_PATH));
  assert.equal(buildBrief(f.root, 'production', undefined, invocation).referenceApplication, null);
});

test('selected role handoff includes source-free screen application and refuses a removed plan', t => {
  const f = applicationFixture(t);
  const invocation = createTestProjectRunInvocation(f.root);
  selectReferenceCandidateV2(f.root, 'candidate', [{ slotId: 'hero', obligationDisposition: 'used', obligationReason: 'Selected hierarchy for this screen.' }], invocation);
  writeReferenceHandoffReceipt(f.root, 'art-direction', invocation);
  assert.throws(() => readSelectedReferenceHandoff(f.root, 'art-direction'));
  publishReferenceApplication(f.root, f.application, f.options, f.writer);
  const handoff = readSelectedReferenceHandoff(f.root, 'art-direction');
  assert.equal(handoff.screenApplication?.screens.length, 2);
  assert.equal(handoff.screenApplication?.screens[0]!.design.application, f.application.screens[0]!.design.application);
  assert.doesNotMatch(JSON.stringify(handoff), /domain\.example|design\.example|referenceIds|\.omd\/refs/);
  rmSync(join(f.root, REFERENCE_APPLICATION_PATH));
  assert.throws(() => readSelectedReferenceHandoff(f.root, 'art-direction'));
});

test('a benchmark-selected product route cannot complete with a prose-only domain lane', t => {
  const value = fixture(t);
  const parsed = parseReferenceResearch(value.research);
  assert.throws(() => validateReferenceResearch(value.root, parsed, {
    expectedSourceContractSha256: SOURCE_SHA,
    benchmarkRequired: true,
  }), /REFERENCE_RESEARCH_BENCHMARK_REQUIRED/);
});

test('publishing or changing application decisions invalidates preliminary and final source seals', t => {
  const f = fixture(t);
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  input.designAxes.expressiveDesignNeed = 'restrained';
  input.strategyDecision.methods = input.strategyDecision.methods.map((method: string) => method === 'design-strategy-expressive-campaign' ? 'design-strategy-operational-ux' : method);
  input.strategyDecision.stages = input.strategyDecision.stages.filter((stage: string) => stage !== 'art-direction');
  input.strategyDecision.skips.push({ id: 'art-direction', reason: 'This seal test uses a restrained existing visual direction.' });
  const invocation = publishTestAdaptiveRoute(f.root, input);
  const route = readPersistedRoute(f.root, invocation);
  const writer = createTestProjectWriteAdapter(f.root, invocation);
  const options = { expectedSourceContractSha256: route.sourceContractSha256, benchmarkRequired: false };
  writeFileSync(join(f.root, 'index.html'), '<main>Test surface</main>');
  const proof = `## Production revision binding\n- Production entry: \`index.html\`\n- Production revision SHA-256: \`${servedProjectTreeSha256(f.root, 'index.html')}\`\n`;
  for (const name of ['copy-deck.md', 'type-proof.md', 'composition.md']) writeFileSync(join(f.root, '.omd', name), proof);
  // A preparatory snapshot is not permission to skip the application at terminal completion.
  writeSourceSeal(f.root, invocation);
  assert.deepEqual(validateSourceSeal(f.root, invocation), []);
  f.research.sourceContractSha256 = route.sourceContractSha256;
  publishReferenceResearch(f.root, f.research, options, writer);
  writeFileSync(join(f.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief(route.request)));
  const application = filledApplication(f.root, options);
  publishReferenceApplication(f.root, application, options, writer);
  assert.ok(validateSourceSeal(f.root, invocation).length > 0, 'publishing the missing plan invalidates the preliminary seal');
  writeSourceSeal(f.root, invocation);
  assert.deepEqual(validateSourceSeal(f.root, invocation), []);
  const seal = JSON.parse(readFileSync(join(f.root, '.omd/source-seal.json'), 'utf8'));
  assert.equal(seal.inputs.referenceApplicationSha256, digest(readFileSync(join(f.root, REFERENCE_APPLICATION_PATH))));
  application.screens[0]!.checks.push('Keep the progress state next to its object.');
  publishReferenceApplication(f.root, application, options, writer);
  assert.ok(validateSourceSeal(f.root, invocation).length > 0, 'changed criteria invalidate the sealed production inputs');
  writeSourceSeal(f.root, invocation);
  assert.deepEqual(validateSourceSeal(f.root, invocation), []);
  rmSync(join(f.root, REFERENCE_APPLICATION_PATH));
  assert.ok(validateSourceSeal(f.root, invocation).length > 0, 'removing the plan cannot downgrade the sealed route');
});

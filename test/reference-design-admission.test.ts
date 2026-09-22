import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseReferenceResearch, publishReferenceResearch, validateReferenceResearch } from '../core/ref/reference-research.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { saveRef } from '../core/ref/store.ts';
import { persistImageFragment } from '../core/ref/image-fragment.ts';
import { createTestProjectRunInvocation, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { ADMISSION_SOURCE_SHA, admissionHash, designAdmissionFixture } from './helpers/design-admission.ts';
import { briefReferences } from '../core/brief/index.ts';
import { loadReferenceBoard } from '../core/ref/board.ts';
import { inspectDesignReferenceAdmission, requiresDesignReferenceAdmission } from '../core/ref/design-admission.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';

const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false };

test('research publication rejects an extra legacy domain visual while preserving the existing board', t => {
  const fixture = designAdmissionFixture(t);
  const { root, source, domain, board, boardPath, research, writer } = fixture;
  const legacy = { ...source.ref, source: domain.source, component: 'legacy-domain', imagePath: domain.evidence.path };
  delete legacy.researchLane; delete legacy.acquisition;
  saveRef(root, legacy, writer);
  const candidate = board.candidates[0]; assert.ok(candidate);
  const piece = candidate.pieces[0]; assert.ok(piece);
  candidate.pieces.push({ ...piece, slotId: 'legacy', referenceId: refIdentity(legacy.source, legacy.component), grid: { column: 1, span: 12, order: 1 } });
  fixture.refreshBoard();
  const before = readFileSync(boardPath);
  assert.throws(() => publishReferenceResearch(root, research, options, writer), /DESIGN_REFERENCE_INELIGIBLE|BOARD_SOURCE_COVERAGE/);
  assert.deepEqual(readFileSync(boardPath), before);
});

test('research publication binds source identity when another qualified capture aliases its image', t => {
  const fixture = designAdmissionFixture(t);
  const { root, source, gallery, research, board, writer } = fixture;
  const alias = { ...source.ref, source: 'https://visual.example/other', component: 'alias', acquisition: { ...source.ref.acquisition, requestedUrl: 'https://visual.example/other', finalUrl: 'https://visual.example/other', httpStatus: 200, links: [], imageSha256: source.evidence.sha256 } };
  saveRef(root, alias, writer);
  const acquisition = gallery.ref.acquisition; assert.ok(acquisition); acquisition.links.push(alias.source);
  saveRef(root, gallery.ref, writer);
  const design = research.designReference.sources[0]; assert.ok(design);
  design.discovery.capture.sha256 = admissionHash(readFileSync(gallery.path));
  const candidate = board.candidates[0]; assert.ok(candidate); const piece = candidate.pieces[0]; assert.ok(piece);
  piece.referenceId = refIdentity(alias.source, alias.component);
  fixture.refreshBoard();
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), options), /BOARD_SOURCE_COVERAGE/);
});

test('retained research sources reject native navigation-only receipts', t => {
  const { root, domain, research } = designAdmissionFixture(t);
  const record = { ...domain.ref, schema: 'reference-navigation-capture-v1', kind: 'page' };
  writeFileSync(domain.path, JSON.stringify(record));
  const retained = research.domainReference.sources[0]; assert.ok(retained);
  retained.capture.sha256 = admissionHash(readFileSync(domain.path));
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), options), /CAPTURE_PURPOSE/);
});

test('image import rejects domain PNG relabelled as gallery provenance', t => {
  const { root, domain, gallery } = designAdmissionFixture(t);
  assert.throws(() => persistImageFragment(root, {
    inputPath: domain.evidence.path,
    provenance: { sourcePage: gallery.source, captureRegion: 'Task image', licenseStatus: 'unknown', rightsNotes: 'Study only', capturedAt: '2026-09-21T00:00:00.000Z' },
    transfer: { visualRole: 'Task hierarchy', principles: ['Keep the task anchored.'] },
  }, createTestProjectRunInvocation(root)), /DESIGN_REFERENCE_INELIGIBLE|FRAGMENT_SOURCE/);
});

test('valid gallery and observed original retain research publication', t => {
  const { root, research } = designAdmissionFixture(t);
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(research), options));
});

test('website gallery wrappers are discovery evidence, not retained visual evidence', t => {
  const { root, capture, writer } = designAdmissionFixture(t);
  const cases = [
    'https://www.pinterest.com/pin/987654321/',
    'https://dribbble.com/shots/19161192-Benefits-Dashboard-UI',
    'https://www.behance.net/gallery/123456789/Task-workspace',
    'https://www.siteinspire.com/website/13593-yuri-roga',
    'https://land-book.com/websites/finance-dashboard',
    'https://godly.website/website/task-workspace',
    'https://uibowl.io/screens/task/detail',
    'https://mobbin.com/explore/screens/7b35b6c7-f954-4dcb-b320-3ad873339477',
    'https://pageflows.com/screens/6753bc45-9853-4b61-a78e-c95827d347e5/',
  ];
  cases.forEach((url, index) => {
    const original = capture(`https://wrapper-original-${index}.example/task`, `original-${index}`, 'design', 30 + index * 2);
    const wrapper = capture(url, `gallery-wrapper-${index}`, 'design', 31 + index * 2, [original.source]);
    saveRef(root, wrapper.ref, writer);
    const wrapperAdmission = inspectDesignReferenceAdmission(root, wrapper.ref);
    assert.equal(wrapperAdmission.eligible, false);
    assert.equal(wrapperAdmission.code, 'discovery');
    const originalAdmission = inspectDesignReferenceAdmission(root, original.ref);
    assert.equal(originalAdmission.eligible, true);
    assert.equal(originalAdmission.code, 'observed-original');
    assert.equal(originalAdmission.discoverySource, wrapper.source);
  });
});

test('a user marker cannot promote gallery wrapper chrome into retained evidence', t => {
  const { root, capture } = designAdmissionFixture(t);
  const wrapper = capture('https://mobbin.com/explore/screens/7b35b6c7-f954-4dcb-b320-3ad873339477', 'user-gallery-wrapper', 'design', 60);
  wrapper.ref.origin = 'user';
  const retained = inspectDesignReferenceAdmission(root, wrapper.ref);
  assert.equal(retained.eligible, false);
  assert.equal(retained.code, 'discovery');
  const provenance = inspectDesignReferenceAdmission(root, wrapper.ref, { purpose: 'discovery' });
  assert.equal(provenance.eligible, true);
  assert.equal(provenance.code, 'gallery');
});

test('a user marker cannot bypass gallery policy through redirects', t => {
  const { root, capture } = designAdmissionFixture(t);
  const away = capture('https://mobbin.com/explore/screens/7b35b6c7-f954-4dcb-b320-3ad873339477', 'redirect-away', 'design', 61);
  away.ref.origin = 'user';
  assert.ok(away.ref.acquisition);
  away.ref.acquisition.finalUrl = 'https://actual-product.example/screen';
  assert.equal(inspectDesignReferenceAdmission(root, away.ref).eligible, false);

  const changedItem = capture('https://mobbin.com/explore/screens/7b35b6c7-f954-4dcb-b320-3ad873339477', 'redirect-item', 'design', 63);
  assert.ok(changedItem.ref.acquisition);
  changedItem.ref.acquisition.finalUrl = 'https://mobbin.com/explore/screens/82f0afed-ed7c-4a16-9a8b-4a593b03bcd4';
  assert.equal(inspectDesignReferenceAdmission(root, changedItem.ref, { purpose: 'discovery' }).eligible, false);

  const changedProvider = capture('https://mobbin.com/explore/screens/7b35b6c7-f954-4dcb-b320-3ad873339477', 'redirect-provider', 'design', 64);
  assert.ok(changedProvider.ref.acquisition);
  changedProvider.ref.acquisition.finalUrl = 'https://pageflows.com/screens/6753bc45-9853-4b61-a78e-c95827d347e5/';
  assert.equal(inspectDesignReferenceAdmission(root, changedProvider.ref, { purpose: 'discovery' }).eligible, false);

  const into = capture('https://actual-product.example/screen', 'redirect-into', 'design', 62);
  into.ref.origin = 'user';
  assert.ok(into.ref.acquisition);
  into.ref.acquisition.finalUrl = 'https://pageflows.com/screens/6753bc45-9853-4b61-a78e-c95827d347e5/';
  assert.equal(inspectDesignReferenceAdmission(root, into.ref).eligible, false);
});

test('selected discovery refuses a copied domain image with a gallery source declaration', t => {
  const { root, domain, gallery, research } = designAdmissionFixture(t);
  writeFileSync(join(root, '.omd/reference-research.json'), JSON.stringify(research));
  const inputPath = '.omd/refs/design/copied.png';
  copyFileSync(join(root, domain.evidence.path), join(root, inputPath));
  assert.throws(() => persistImageFragment(root, {
    inputPath,
    provenance: { sourcePage: gallery.source, captureRegion: 'Task image', licenseStatus: 'unknown', rightsNotes: 'Study only', capturedAt: '2026-09-21T00:00:00.000Z' },
    transfer: { visualRole: 'Task hierarchy', principles: ['Keep the task anchored.'] },
  }, createTestProjectRunInvocation(root)), /FRAGMENT_SOURCE/);
});

test('selected discovery keeps legacy captures archival and excludes them from actionable briefs and boards', t => {
  const { root, source, domain, research, writer, board, refreshBoard } = designAdmissionFixture(t);
  const legacy = { ...source.ref, source: domain.source, component: 'legacy-domain', imagePath: domain.evidence.path };
  delete legacy.researchLane; delete legacy.acquisition;
  saveRef(root, legacy, writer);
  writeFileSync(join(root, '.omd/reference-research.json'), JSON.stringify(research));
  assert.equal(briefReferences(root).some(row => row.component === legacy.component), false);
  const candidate = board.candidates[0]; assert.ok(candidate); const piece = candidate.pieces[0]; assert.ok(piece);
  piece.referenceId = refIdentity(legacy.source, legacy.component); refreshBoard();
  assert.throws(() => loadReferenceBoard(root), /DESIGN_REFERENCE_INELIGIBLE/);
});

test('selected discovery retains a gallery fragment derived from its actual native image', t => {
  const { root, gallery, research, board, receipt, refreshBoard } = designAdmissionFixture(t);
  writeFileSync(join(root, '.omd/reference-research.json'), JSON.stringify(research));
  const fragment = persistImageFragment(root, {
    inputPath: gallery.evidence.path,
    provenance: { sourcePage: gallery.source, captureRegion: 'Task image', cropBox: { x: 0, y: 0, width: 1, height: 1 }, licenseStatus: 'unknown', rightsNotes: 'Study only', capturedAt: '2026-09-21T00:00:00.000Z' },
    transfer: { visualRole: 'Task hierarchy', principles: ['Keep the task anchored.'] },
  }, createTestProjectRunInvocation(root));
  const retained = research.designReference.sources[0]; assert.ok(retained);
  retained.url = gallery.source;
  retained.evidence = receipt(join(root, fragment.imagePath));
  retained.capture = receipt(join(root, '.omd/refs/design/fragments', `${fragment.id}.json`));
  const candidate = board.candidates[0]; assert.ok(candidate); const piece = candidate.pieces[0]; assert.ok(piece);
  piece.sourceKind = 'image-fragment'; piece.referenceId = fragment.id; piece.take = ['density']; refreshBoard();
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(research), options));
});

test('admission preserves the existing native user-reference contract', t => {
  const { root, capture, writer } = designAdmissionFixture(t);
  const user = capture('https://user.example/reference', 'user', 'design', 9);
  user.ref.origin = 'user'; saveRef(root, user.ref, writer);
  assert.equal(inspectDesignReferenceAdmission(root, user.ref).code, 'user-provided');
});

test('admission rejects a user marker without its native capture', t => {
  const { root, capture, writer } = designAdmissionFixture(t);
  const user = capture('https://user.example/reference', 'user', 'design', 9);
  user.ref.origin = 'user'; delete user.ref.acquisition; saveRef(root, user.ref, writer);
  assert.equal(inspectDesignReferenceAdmission(root, user.ref).eligible, false);
});

test('admission rejects a renamed image shared with a legacy domain capture', t => {
  const { root, domain, capture, writer } = designAdmissionFixture(t);
  delete domain.ref.acquisition; saveRef(root, domain.ref, writer);
  const visual = capture('https://dribbble.com/shots/123-screen', 'visual', 'design', 3);
  assert.equal(inspectDesignReferenceAdmission(root, visual.ref).eligible, false);
});

test('research binds the retained component identity on the same source page', t => {
  const { root, source, research, board, writer, refreshBoard } = designAdmissionFixture(t);
  const alias = { ...source.ref, component: 'different-component' }; saveRef(root, alias, writer);
  const candidate = board.candidates[0]; assert.ok(candidate); const piece = candidate.pieces[0]; assert.ok(piece);
  piece.referenceId = refIdentity(alias.source, alias.component); refreshBoard();
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), options), /BOARD_SOURCE_COVERAGE/);
});

test('research accepts native navigation diagnostics in the discovery namespace', t => {
  const { root, gallery, research, receipt } = designAdmissionFixture(t);
  const start = 'https://www.pinterest.com/pin/987654321/';
  const directory = '.omd/discovery/design/navigation'; mkdirSync(join(root, directory), { recursive: true });
  const imagePath = `${directory}/hop.png`; copyFileSync(join(root, gallery.evidence.path), join(root, imagePath));
  const capturePath = join(root, directory, 'hop.json');
  writeFileSync(capturePath, JSON.stringify({ schema: 'reference-navigation-capture-v1', source: start, researchLane: 'design', kind: 'page',
    capturedAt: '2026-09-21T00:00:00.000Z', imagePath,
    acquisition: { requestedUrl: start, finalUrl: start, httpStatus: 200, links: [gallery.source], imageSha256: gallery.evidence.sha256 } }));
  const input = { ...research, designReference: { ...research.designReference,
    searches: [testSearchReceipt(root, 'design', 'visual task', [start])],
    navigation: [{ url: start, evidence: receipt(join(root, imagePath)), capture: receipt(capturePath) }],
  } };
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(input), options));
});

test('research refuses discovery namespace receipts in retained source fields', t => {
  const { research } = designAdmissionFixture(t);
  const source = research.designReference.sources[0]; assert.ok(source);
  source.evidence.path = '.omd/discovery/design/navigation/hop.png';
  assert.throws(() => parseReferenceResearch(research), /EVIDENCE_PATH/);
});

test('an explicit current discovery skip is not overridden by historical research files', t => {
  const { root, research } = designAdmissionFixture(t);
  writeFileSync(join(root, '.omd/reference-research.json'), JSON.stringify(research));
  const route: unknown = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  publishTestAdaptiveRoute(root, route);
  assert.equal(requiresDesignReferenceAdmission(root), false);
});

test('admission preserves a native local file explicitly supplied by the user', t => {
  const { root, capture, writer } = designAdmissionFixture(t);
  const user = capture('file:///provided/user-reference.html', 'user-file', 'design', 9);
  user.ref.origin = 'user'; const acquisition = user.ref.acquisition; assert.ok(acquisition); acquisition.httpStatus = null;
  saveRef(root, user.ref, writer);
  assert.equal(inspectDesignReferenceAdmission(root, user.ref).eligible, true);
});

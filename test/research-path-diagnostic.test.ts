import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseReferenceResearch, validateReferenceResearch } from '../core/ref/reference-research.ts';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { withBrowser } from '../core/render/index.ts';
import { saveRef } from '../core/ref/store.ts';
import { discoveryBrowser, directoryHtml } from './helpers/discovery-capture.ts';
import { ADMISSION_SOURCE_SHA, admissionPng, designAdmissionFixture } from './helpers/design-admission.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const cli = join(repo, 'bin/omd.ts');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
const run = (root: string, args: readonly string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: 'utf8', timeout: 30_000 });

for (const receipt of ['evidence', 'capture'] as const) {
  test(`retained discovery ${receipt} rejects navigation paths with its exact source index`, t => {
    const { research } = designAdmissionFixture(t);
    const source = research.designReference.sources[0]; assert.ok(source);
    research.designReference.sources.unshift({ ...structuredClone(source), id: 'earlier-source' });
    source.discovery[receipt].path = `.omd/discovery/design/navigation/gallery.${receipt === 'evidence' ? 'png' : 'json'}`;
    const before = JSON.stringify(research);
    assert.throws(() => parseReferenceResearch(research), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.startsWith('REFERENCE_RESEARCH_EVIDENCE_PATH'));
      assert.ok(error.message.includes(`designReference.sources[1].discovery.${receipt}.path`), error.message);
      return true;
    });
    assert.equal(JSON.stringify(research), before);
  });
}

for (const lane of ['domainReference', 'designReference'] as const) {
  for (const receipt of ['evidence', 'capture'] as const) {
    test(`${lane} retained ${receipt} path identifies its source field`, t => {
      const { research } = designAdmissionFixture(t);
      const source = research[lane].sources[0]; assert.ok(source);
      source[receipt].path = '../outside-project.png';
      assert.throws(() => parseReferenceResearch(research), error => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.startsWith('REFERENCE_RESEARCH_EVIDENCE_PATH'));
        assert.ok(error.message.includes(`${lane}.sources[0].${receipt}.path`), error.message);
        return true;
      });
    });
  }
}

test('native retained discovery remains valid with a separately declared navigation capture', async t => {
  const { root, research, gallery, source, writer } = designAdmissionFixture(t);
  const navigation = await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: gallery.source, html: directoryHtml(source.source) });
    return captureReferenceNavigation(observed.browser, gallery.source, 'design', writer);
  });
  const input = { ...research, designReference: { ...research.designReference, navigation: [{
    url: gallery.source, evidence: navigation.evidence, capture: navigation.capture,
  }] } };
  const parsed = parseReferenceResearch(input);
  assert.doesNotThrow(() => validateReferenceResearch(root, parsed, {
    expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false,
  }));
  const diagnosticOnly = { ...input, designReference: { ...input.designReference, navigation: [{
    url: gallery.source,
    evidence: { path: '.omd/discovery/design/navigation/gallery.png', sha256: gallery.evidence.sha256 },
    capture: { path: '.omd/discovery/design/navigation/gallery.json', sha256: gallery.capture.sha256 },
  }] } };
  const diagnosticParsed = parseReferenceResearch(diagnosticOnly);
  assert.equal(diagnosticParsed.designReference.navigation?.[0]?.evidence.path, '.omd/discovery/design/navigation/gallery.png');
  assert.throws(() => validateReferenceResearch(root, diagnosticParsed, {
    expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false,
  }), /capture requires its exact content-addressed lane\/purpose path/);
});

for (const receipt of ['evidence', 'capture'] as const) {
  test(`research-set CLI names the rejected discovery ${receipt} field without publishing`, t => {
    const { root, research, boardPath } = designAdmissionFixture(t);
    const source = research.designReference.sources[0]; assert.ok(source);
    source.discovery[receipt].path = `.omd/discovery/design/navigation/gallery.${receipt === 'evidence' ? 'png' : 'json'}`;
    const route = run(root, ['route', 'classify', '--input', join(repo, 'test/fixtures/adaptive-flow/medical-new-product.json'), '--json']);
    assert.equal(route.status, 0, route.stderr);
    const inputPath = join(root, '.omd/reference-research-input.json');
    writeFileSync(inputPath, JSON.stringify(research));
    const inputBefore = readFileSync(inputPath);
    const boardBefore = readFileSync(boardPath);
    const result = run(root, ['ref', 'research-set', '--input', inputPath, '--json']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.startsWith('REFERENCE_RESEARCH_EVIDENCE_PATH'));
    assert.ok(result.stderr.includes(`designReference.sources[0].discovery.${receipt}.path`), result.stderr);
    assert.equal(existsSync(join(root, '.omd/reference-research.json')), false);
    assert.equal(existsSync(join(root, '.omd/refs/design/research.json')), false);
    assert.deepEqual(readFileSync(inputPath), inputBefore);
    assert.deepEqual(readFileSync(boardPath), boardBefore);
  });
}

test('changed native capture reports its stale receipt path until restored or deliberately reinterpreted', t => {
  const { root, research, domain, writer, receipt } = designAdmissionFixture(t);
  const retained = research.domainReference.sources[0]; assert.ok(retained);
  const original = readFileSync(domain.path);
  const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false };
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(research), options));
  const changed = { ...domain.ref, principles: ['Revised observed task grouping.'] };
  saveRef(root, changed, writer);
  const before = JSON.stringify(research);
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), options), error => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.startsWith('REFERENCE_RESEARCH_EVIDENCE_STALE'));
    assert.ok(error.message.includes(retained.capture.path), error.message);
    assert.ok(error.message.includes('omd hash'), error.message);
    return true;
  });
  assert.equal(JSON.stringify(research), before);
  assert.equal(existsSync(join(root, '.omd/reference-research.json')), false);
  writeFileSync(domain.path, original);
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(research), options));
  saveRef(root, changed, writer);
  retained.finding = 'The updated native record groups task preparation before review.';
  retained.capture = receipt(domain.path);
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(research), options));
});

test('changed PNG reports its stale receipt path and restoring captured bytes clears the refusal', t => {
  const { root, research, domain } = designAdmissionFixture(t);
  const retained = research.domainReference.sources[0]; assert.ok(retained);
  const imagePath = join(root, retained.evidence.path);
  const original = readFileSync(imagePath);
  const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false };
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(research), options));
  writeFileSync(imagePath, admissionPng(99));
  const before = JSON.stringify(research);
  assert.throws(() => validateReferenceResearch(root, parseReferenceResearch(research), options), error => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.startsWith('REFERENCE_RESEARCH_EVIDENCE_STALE'));
    assert.ok(error.message.includes(domain.evidence.path), error.message);
    assert.ok(error.message.includes('omd hash'), error.message);
    return true;
  });
  assert.equal(JSON.stringify(research), before);
  assert.equal(existsSync(join(root, '.omd/reference-research.json')), false);
  writeFileSync(imagePath, original);
  assert.doesNotThrow(() => validateReferenceResearch(root, parseReferenceResearch(research), options));
});

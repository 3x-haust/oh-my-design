import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReferenceResearch } from '../core/ref/reference-research.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';

test('discovery root key errors name the exact row and missing or extra fields', t => {
  const fixture = designAdmissionFixture(t);
  const input = {
    ...fixture.research,
    schema: 'reference-research-v6',
    domainReference: {
      ...fixture.research.domainReference,
      discoveryRoots: [{ method: 'direct-public', entry: 'public-directory', url: 'https://www.usa.gov/benefits',
        extra: 'copied field', evidence: {}, capture: {} }],
    },
  };
  assert.throws(() => parseReferenceResearch(input),
    /REFERENCE_RESEARCH_DISCOVERY_ROOT_KEYS: domainReference\.discoveryRoots\[0\].*missing=\[reason\].*extra=\[extra\]/);
});

test('invalid evidence digests identify the exact research field before publication', t => {
  const fixture = designAdmissionFixture(t);
  const source = fixture.research.designReference.sources[0]!;
  const input = {
    ...fixture.research,
    designReference: { ...fixture.research.designReference,
      sources: [{ ...source, capture: { ...source.capture, sha256: '' } }] },
  };
  assert.throws(() => parseReferenceResearch(input),
    /REFERENCE_RESEARCH_EVIDENCE_SHA: designReference\.sources\[0\]\.capture\.sha256 must be 64 lowercase hexadecimal characters/);
});

test('discovery root receipts report the required content-addressed path', t => {
  const fixture = designAdmissionFixture(t);
  const sha256 = 'a'.repeat(64);
  const root = { method: 'direct-public', entry: 'public-directory', url: 'https://www.usa.gov/benefits',
    reason: 'Public benefits directory', evidence: { path: '.omd/discovery/domain/entries/copied.png', sha256 },
    capture: { path: `.omd/discovery/domain/entries/${sha256}.json`, sha256 } };
  const input = { ...fixture.research, schema: 'reference-research-v6',
    domainReference: { ...fixture.research.domainReference, discoveryRoots: [root] } };
  assert.throws(() => parseReferenceResearch(input),
    /REFERENCE_RESEARCH_DISCOVERY_ROOT_PATH: domainReference\.discoveryRoots\[0\]\.evidence\.path must equal \.omd\/discovery\/domain\/entries\/a{64}\.png/);
});

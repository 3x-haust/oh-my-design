import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import {
  CULTURAL_DESIGN_AXES,
  culturalDesignProfileSha256,
  culturalDesignProjectionSha256,
  projectCulturalDesignProfile,
  validateCulturalDesignProfile,
} from '../core/locale/cultural-profile.ts';
import { canonicalLocaleDesignJson, routeLocaleDesignContext } from '../core/locale/design-context.ts';
import { authorReferenceBoard } from '../core/ref/board-author.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import {
  buildReferenceLocaleBinding,
  REFERENCE_LOCALE_BINDING_EVIDENCE_PATH,
  REFERENCE_LOCALE_BINDING_PATH,
  validateReferenceLocaleBindingCurrentness,
} from '../core/ref/reference-locale-binding.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
const INVARIANTS: Invariants = { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
const hash = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const localeBytes = (value: unknown): string => `${canonicalLocaleDesignJson(value)}\n`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-locale-binding-'));
  mkdirSync(join(root, '.omd', 'refs'), { recursive: true });
  const context = {
    schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ja-JP',
    marketRegion: 'JP', audience: 'Adults comparing public cultural events',
    domain: 'cultural event discovery', surface: 'product', desiredFit: 'market-grounded',
    brandInvariants: ['Event facts remain unchanged'],
  };
  const contextFile = `${JSON.stringify(context, null, 2)}\n`;
  writeFileSync(join(root, '.omd', 'locale-design-context.json'), contextFile);
  const route = routeLocaleDesignContext(context);
  const typeProof = '日本語の展覧会名、会期、会場、料金を実寸で確認した。\n';
  writeFileSync(join(root, '.omd', 'type-proof.md'), typeProof);

  const sourceSpecs = [
    { id: 'standard', lane: 'standard', url: 'https://standards.example.org/japanese-layout' },
    { id: 'global', lane: 'global-equivalent', url: 'https://global.example.com/events/tokyo' },
    { id: 'native', lane: 'native-category', url: 'https://local.example.jp/events/current' },
    { id: 'counter', lane: 'counterexample', url: 'https://local.example.jp/promotions/current' },
  ] as const;
  const sources = sourceSpecs.map((source) => {
    const content = Buffer.from(`current source bytes: ${source.id}`);
    const contentSha256 = hash(content);
    const contentRecord = `locale-source-bytes/sha256-${contentSha256}.bin`;
    mkdirSync(join(root, '.omd', 'locale-source-bytes'), { recursive: true });
    writeFileSync(join(root, '.omd', contentRecord), content);
    const receipt = {
      schema: 'cultural-design-source-receipt-v1', contextSha256: route.contextSha256,
      status: 'captured', url: source.url, attemptedUrl: source.url,
      capturedAt: '2026-09-04T00:00:00.000Z', contentType: 'text/html; charset=utf-8',
      contentSha256, contentRecord, reason: null,
    };
    const receiptBytes = localeBytes(receipt);
    const captureSha256 = hash(receiptBytes);
    mkdirSync(join(root, '.omd', 'locale-source-receipts'), { recursive: true });
    writeFileSync(join(root, '.omd', `locale-source-receipts/sha256-${captureSha256}.json`), receiptBytes);
    return {
      id: source.id, lane: source.lane, status: 'captured', url: source.url,
      capturedAt: receipt.capturedAt, captureSha256,
      observation: `${source.id} event-list observation.`, scope: 'List and selected detail task.',
    };
  });
  const profileValue = {
    schema: 'cultural-design-profile-v1', contextSha256: route.contextSha256,
    capturedAt: '2026-09-04T00:00:00.000Z', sources,
    brandInvariants: context.brandInvariants, authorizedMarketFacts: [], typeProofSha256: hash(typeProof),
    decisions: CULTURAL_DESIGN_AXES.map((axis) => axis === 'list-detail-hierarchy' ? {
      id: 'event-choice-detail', axis, status: 'supported',
      sourceIds: ['standard', 'global', 'native'], counterexampleIds: ['counter'],
      mechanism: 'Keep event choices compact and facts label aligned.',
      adaptation: 'Use the destination event facts and responsive order.',
      avoid: 'Avoid promotional hierarchy that hides comparable facts.',
      falsifier: 'A non-default event cannot expose its complete facts at either viewport.',
    } : {
      id: `locale-${axis}`, axis, status: 'unknown', sourceIds: [], counterexampleIds: [],
      mechanism: null, adaptation: null, avoid: `Avoid unsupported ${axis}.`,
      falsifier: `Reject invented ${axis}.`,
    }),
    rejectedCliches: ['Do not treat Japanese text as a national style preset'], confidence: 'contested',
  };
  const profile = validateCulturalDesignProfile(profileValue, route);
  const profileSha256 = culturalDesignProfileSha256(profile);
  const projection = projectCulturalDesignProfile(profile, route);
  const projectionSha256 = culturalDesignProjectionSha256(projection);
  mkdirSync(join(root, '.omd', 'locale-profiles'), { recursive: true });
  mkdirSync(join(root, '.omd', 'locale-projections'), { recursive: true });
  writeFileSync(join(root, '.omd', `locale-profiles/sha256-${profileSha256}.json`), localeBytes(profile));
  writeFileSync(join(root, '.omd', `locale-projections/sha256-${projectionSha256}.json`), localeBytes(projection));
  writeFileSync(join(root, '.omd', 'cultural-design-profile.json'), localeBytes({ schema: 'cultural-design-profile-pointer-v1', record: `locale-profiles/sha256-${profileSha256}.json`, sha256: profileSha256, contextSha256: route.contextSha256 }));
  writeFileSync(join(root, '.omd', 'cultural-design-projection.json'), localeBytes({ schema: 'cultural-design-projection-pointer-v1', record: `locale-projections/sha256-${projectionSha256}.json`, sha256: projectionSha256, contextSha256: route.contextSha256 }));

  writeFileSync(join(root, '.omd', 'frame.md'), '# Locale-bound event explorer\n');
  const acquisition = {
    schema: 'reference-acquisition-plan-v2', owner: 'omd-framer', localeContextSha256: route.contextSha256,
    zones: [{ id: 'event-detail', kind: 'state', job: 'Compare one event and its facts.', required: true,
      decisionId: 'event-detail-structure', question: 'How do choices and selected facts remain scannable?',
      axes: ['structure'], requiredState: 'selected', viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
      falsifier: 'The selected event facts are incomplete or the choices are not reachable.' }],
  };
  writeFileSync(join(root, '.omd', 'acquisition-plan.json'), canonicalJson(acquisition));
  const adapter = createTestProjectWriteAdapter(root);
  const blueprint: Blueprint = { selector: '.events', capturedAt: '2026-09-04T00:00:00.000Z', nodes: [{ id: 'root', role: 'container', children: [], box: { w: 640, h: 360 } }] };
  for (const component of ['native-list-a', 'native-list-b']) {
    const spec = { source: sourceSpecs[2].url, component, selector: '.events', slot: 'event-detail' };
    const imagePath = refImagePath(root, spec);
    const reference: Reference = { ...spec, kind: 'component', capturedAt: '2026-09-04T00:00:00.000Z', viewport: { width: 1280, height: 900 }, invariants: INVARIANTS, principles: ['Compact choices preserve fact scanning.'], blueprint, imagePath: relative(root, imagePath) };
    saveRef(root, reference, adapter); writeFileSync(imagePath, PNG);
  }
  const piece = (component: string) => ({
    slotId: `slot-${component.endsWith('a') ? 'a' : 'b'}`, source: sourceSpecs[2].url, component,
    targetComponent: 'EventExplorer', targetSelector: '[data-zone="event-detail"]', taskIds: ['T1'],
    reason: 'Use the measured local event list and detail relation.', take: ['structure'],
    avoid: 'Do not copy source identity or event copy.', adaptation: 'Use destination facts and type.',
    grid: { column: 1, span: 12, order: 0 }, rights: 'lawful', signal: 'high-visual-system', motionAxis: 'absent',
    binding: { zoneId: 'event-detail', decisionId: 'event-detail-structure', axis: 'structure', sourceState: 'selected',
      sourceViewport: { width: 1280, height: 900 }, targetViewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
      responsiveConsequence: 'The choice list precedes the selected facts on mobile.', conflictGroup: null, conflictResolution: null,
      falsifier: 'The selected event facts are incomplete or the choices are not reachable.' },
  });
  const board = authorReferenceBoard(root, { candidates: [
    { id: 'candidate-a', label: 'A', route: '/events', rationale: 'Native list relation A.', pieces: [piece('native-list-a')] },
    { id: 'candidate-b', label: 'B', route: '/events', rationale: 'Native list relation B.', pieces: [piece('native-list-b')] },
  ] });
  writeFileSync(join(root, '.omd', 'reference-board.json'), canonicalJson(board));
  const input = { bindings: [
    { candidateId: 'candidate-a', slotId: 'slot-a', localeDecisionId: 'event-choice-detail' },
    { candidateId: 'candidate-b', slotId: 'slot-b', localeDecisionId: 'event-choice-detail' },
  ] };
  return { root, input, profileSha256, context };
}

test('locale binding makes exact local reference use source-bound and source-free downstream', () => {
  const { root, input } = fixture();
  const bundle = buildReferenceLocaleBinding(root, input);
  assert.deepEqual(bundle.projection.bindings.map((entry) => entry.sourceLane), ['native-category', 'native-category']);
  assert.doesNotMatch(canonicalJson(bundle.projection), /local\.example|sourceId|sourceCaptureSha256/);
  assert.match(canonicalJson(bundle.evidence), /"sourceId":"native"/);
  writeFileSync(join(root, REFERENCE_LOCALE_BINDING_PATH), canonicalJson(bundle.projection));
  writeFileSync(join(root, REFERENCE_LOCALE_BINDING_EVIDENCE_PATH), canonicalJson(bundle.evidence));
  assert.equal(validateReferenceLocaleBindingCurrentness(root).projection.bindings.length, 2);
});

test('locale board currentness ignores JSON formatting but rejects semantic context drift', () => {
  const { root, input, context } = fixture();
  const bundle = buildReferenceLocaleBinding(root, input);
  writeFileSync(join(root, REFERENCE_LOCALE_BINDING_PATH), canonicalJson(bundle.projection));
  writeFileSync(join(root, REFERENCE_LOCALE_BINDING_EVIDENCE_PATH), canonicalJson(bundle.evidence));

  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(context)}\n`);
  assert.doesNotThrow(() => validateReferenceLocaleBindingCurrentness(root));

  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify({ ...context, audience: 'A different audience' }, null, 4)}\n`);
  assert.throws(() => validateReferenceLocaleBindingCurrentness(root), /reference board locale design context is stale/);
});


test('locale binding rejects silent, unknown, and stale local-reference claims', () => {
  const { root, input } = fixture();
  const missing = structuredClone(input); missing.bindings.pop();
  assert.throws(() => buildReferenceLocaleBinding(root, missing), /needs at least one positive native-category binding|without an explicit binding/);
  const unknown = structuredClone(input); unknown.bindings[0]!.localeDecisionId = 'locale-motion';
  assert.throws(() => buildReferenceLocaleBinding(root, unknown), /cannot transfer unknown cultural decision/);
  const bundle = buildReferenceLocaleBinding(root, input);
  writeFileSync(join(root, REFERENCE_LOCALE_BINDING_PATH), canonicalJson(bundle.projection));
  writeFileSync(join(root, REFERENCE_LOCALE_BINDING_EVIDENCE_PATH), canonicalJson(bundle.evidence));
  writeFileSync(join(root, '.omd', 'type-proof.md'), 'changed type proof\n');
  assert.throws(() => validateReferenceLocaleBindingCurrentness(root), /LOCALE_DESIGN_TYPE_PROOF_STALE/);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { deflateSync, crc32 } from 'node:zlib';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { parseReferenceHandoffReceipt, validateReferenceHandoffCurrentness } from '../core/ref/reference-handoff.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { parseReferenceSelectionV2, referenceSelectionV2Sha256, validateReferenceSelectionV2 } from '../core/ref/reference-selection.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const CLI = new URL('../bin/omd.ts', import.meta.url).pathname;
const ROOT = new URL('..', import.meta.url).pathname;
const directory = (context: TestContext): string => { const value = mkdtempSync(join(tmpdir(), 'omd-ref-candidates-')); mkdirSync(join(value, '.omd', 'refs'), { recursive: true }); context.after(() => rmSync(value, { recursive: true, force: true })); return value; };
const chunk = (type: string, bytes: Buffer): Buffer => { const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); const body = Buffer.concat([Buffer.from(type), bytes]); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([length, body, checksum]); };
const png = (red = 18): Buffer => { const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, red, 52, 86]))), chunk('IEND', Buffer.alloc(0))]); };
const run = (cwd: string, ...args: readonly string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
const invariants: Invariants = { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
const blueprint: Blueprint = { selector: '[data-card]', capturedAt: '2026-07-19T00:00:00.000Z', nodes: [{ id: 'node', role: 'container', children: [], box: { w: 160, h: 40 } }] };

test('omd ref keeps board operations internal and prints a two-candidate chat table', (context) => {
  const root = directory(context); const source = 'https://capture.example/card'; const component = 'card'; const image = refImagePath(root, { source, component }); const reference: Reference = { source, component, kind: 'component', capturedAt: '2026-07-19T00:00:00.000Z', selector: '[data-card]', invariants, principles: ['Keep hierarchy.'], blueprint, imagePath: relative(root, image) };
  saveRef(root, reference, createTestProjectWriteAdapter(root)); writeFileSync(image, png()); const input = join(root, 'pinterest-fragment.json');
  writeFileSync(input, JSON.stringify({ inputPath: relative(root, image), provenance: { sourcePage: 'https://www.pinterest.com/pin/123', captureRegion: 'blue editorial crop', licenseStatus: 'allowed', rightsNotes: 'Licensed for the declared local abstract study.', capturedAt: '2026-07-19T00:00:00.000Z' }, transfer: { visualRole: 'atmosphere', principles: ['Use only as a local abstract accent.'] } }));

  const imported = run(root, 'ref', 'import-image', input, '--json'); const fragmentId = imported.stdout.match(/"id":"([^"]+)"/)?.[1];
  assert.equal(imported.status, 0, imported.stderr); assert.notEqual(fragmentId, undefined);
  const componentId = refIdentity(source, component); const piece = (slotId: string, sourceKind: string, referenceId: string, column: number, span: number, evidenceAxes: { rights: 'lawful'; signal: 'high-visual-system'; staticAxis: 'available'; motionAxis: 'absent' }) => ({ slotId, sourceKind, referenceId, targetComponent: 'hero', targetSelector: '[data-board="hero"]', taskIds: ['T3'], reason: 'Keep local evidence.', take: ['density'], avoid: 'Do not reproduce source composition.', adaptation: 'Use local spacing tokens.', evidenceAxes, grid: { column, span, order: column } });
  const boardPath = join(root, '.omd', 'reference-board.json');
  writeFileSync(boardPath, JSON.stringify({ schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64), candidates: [{ id: 'structure', label: '계층 우선', route: '/structure', rationale: 'Use component hierarchy.', pieces: [piece('card', 'component-capture', componentId, 1, 6, { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }), piece('pin', 'image-fragment', fragmentId ?? '', 7, 6, { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' })] }, { id: 'atmosphere', label: '분위기 우선', route: '/atmosphere', rationale: 'Use an abstract local accent.', pieces: [piece('pin', 'image-fragment', fragmentId ?? '', 1, 12, { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' })] }] }));

  const checked = run(root, 'ref', 'check', '--json'); const candidates = run(root, 'ref', 'candidates'); const selected = run(root, 'ref', 'select', 'atmosphere', '--json');
  assert.equal(checked.status, 0, checked.stderr); assert.equal(checked.stdout, '[]\n'); assert.equal(candidates.status, 0, candidates.stderr); assert.match(candidates.stdout, /## 후보 \(Candidate\): 계층 우선/); assert.match(candidates.stdout, /## 후보 \(Candidate\): 분위기 우선/); assert.match(candidates.stdout, /capture\.example/); assert.match(candidates.stdout, /www\.pinterest\.com\/pin\/123/); assert.match(candidates.stdout, /blue editorial crop/); assert.equal(selected.status, 0, selected.stderr);
  const envelope = JSON.parse(selected.stdout) as { readonly selection: unknown; readonly handoff: { readonly path: unknown; readonly receipt: unknown } };
  assert.deepEqual(Object.keys(envelope).sort(), ['handoff', 'selection']);
  assert.deepEqual(Object.keys(envelope.handoff).sort(), ['path', 'receipt']);
  assert.equal(envelope.handoff.path, '.omd/reference-handoffs/art-direction.json');
  const selection = parseReferenceSelectionV2(envelope.selection);
  const handoff = parseReferenceHandoffReceipt(envelope.handoff.receipt);
  assert.deepEqual(validateReferenceSelectionV2(root), selection);
  assert.deepEqual(validateReferenceHandoffCurrentness(root, envelope.handoff.receipt), handoff);
  assert.equal(handoff.preSelectionSha256, referenceSelectionV2Sha256(selection));
  assert.match(candidates.stdout, /로컬 캡쳐 \(Local capture\)/); assert.match(candidates.stdout, /\.omd\/refs\//);
  writeFileSync(image, png(34)); const stale = run(root, 'ref', 'check', '--json'); assert.equal(stale.status, 1); assert.match(stale.stderr, /capture hash/);
  const boardContents = readFileSync(boardPath, 'utf8'); const safeSelectors = [String.raw`.\63 ard`, String.raw`[\64 ata-state="\61 ctive"]`]; const unsafeSelectors = ['[src="../capture"]', String.raw`[src="\2e \6f \6d \64 /refs/capture"]`, String.raw`[data-ref="\72 ef-0123456789abcdef"]`, String.raw`[src="\68\74\74\70\73\3a\2f\2f\73\6f\75\72\63\65\2e\65\78\61\6d\70\6c\65"]`, String.raw`[data-origin="\73\6f\75\72\63\65\2e\65\78\61\6d\70\6c\65"]`];
  for (const targetSelector of safeSelectors) {
    writeFileSync(boardPath, boardContents.replace(JSON.stringify('[data-board="hero"]'), JSON.stringify(targetSelector)));
    const safe = run(root, 'ref', 'candidates'); assert.equal(safe.status, 0, safe.stderr); assert.match(safe.stdout, /## 후보 \(Candidate\): 계층 우선/);
  }
  for (const targetSelector of unsafeSelectors) {
    writeFileSync(boardPath, boardContents.replace(JSON.stringify('[data-board="hero"]'), JSON.stringify(targetSelector)));
    const blocked = run(root, 'ref', 'candidates'); assert.equal(blocked.status, 1); assert.equal(blocked.stdout, ''); assert.doesNotMatch(blocked.stdout, /\.omd|capture|source/);
  }
});

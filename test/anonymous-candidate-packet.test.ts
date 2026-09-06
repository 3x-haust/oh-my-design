import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { validateAnonymousCandidatePacket } from '../core/evidence/anonymous-candidate-packet.ts';
import { validateOpticalAdmission } from '../core/evidence/optical-admission.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function sha(bytes: Buffer | string): string { return createHash('sha256').update(bytes).digest('hex'); }
function png(width: number, height: number, marker: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); bytes[32] = marker;
  return bytes;
}

function fixture(): { root: string; packet: any } {
  const root = mkdtempSync(join(tmpdir(), 'omd-anonymous-packet-')); roots.push(root);
  let marker = 1;
  const put = (path: string, value: Buffer | string) => {
    const bytes = typeof value === 'string' ? Buffer.from(value) : value;
    writeFileSync(join(root, path), bytes);
    return { path, sha256: sha(bytes) };
  };
  const combos = [
    { width: 1280, height: 900, state: 'initial' },
    { width: 1280, height: 900, state: 'settled' },
    { width: 390, height: 844, state: 'initial' },
    { width: 390, height: 844, state: 'settled' },
    { width: 320, height: 844, state: 'initial' },
    { width: 320, height: 844, state: 'settled' },
    { width: 195, height: 422, state: 'initial' },
    { width: 195, height: 422, state: 'settled' },
  ] as const;
  const primaries: any[] = []; const supplements: any[] = []; const optical: any[] = [];
  combos.forEach((combo, index) => {
    const viewport = { width: combo.width, height: combo.height };
    const screenshot = put(`p${index}.png`, png(combo.width, combo.height, marker++));
    const primaryMask = put(`pm${index}.png`, png(combo.width, combo.height, marker++));
    const targetMask = put(`tm${index}.png`, png(combo.width, combo.height, marker++));
    const receiptProjection = {
      schema: 'settled-capture-receipt-v1',
      screenshot: { ...screenshot, mode: 'fixed-viewport', viewport, deviceScaleFactor: 1, order: 4 },
      transition: {
        trigger: { kind: 'click', selector: '#reveal', order: 1 },
        signal: { kind: 'dom', selector: '#work', predicate: 'focused-visible', expected: null, subscribedOrder: 0, observedOrder: 2 },
      },
      settlement: { order: 3, rafCommitsBeforeAnimations: 2, finiteAnimations: { observed: 1, settled: 1, pending: 0 }, rafCommitsAfterAnimations: 2, pendingAnimationFrameCallbacks: 0 },
      primary: { selector: '#work', computed: { display: 'block', visibility: 'visible', opacity: 1, rect: { x: 0, y: 0, width: combo.width, height: combo.height }, textLength: 10 }, maskedScreenshot: primaryMask },
      target: { selector: '#judgment', computed: { display: 'block', visibility: 'visible', opacity: 1, rect: { x: 5, y: 5, width: Math.max(1, combo.width - 10), height: 50 }, textLength: 8 }, maskedScreenshot: targetMask },
      skipLinks: [],
    };
    const receipt = put(`r${index}.json`, JSON.stringify(receiptProjection));
    const check = put(`c${index}.json`, '[]');
    primaries.push({ evidenceId: `p${index}`, state: combo.state, viewport, screenshot, receipt, receiptProjection, check, checkResult: [] });
    const full = put(`f${index}.png`, png(combo.width, combo.height + 100, marker++));
    supplements.push({ evidenceId: `f${index}`, state: combo.state, viewport, fullPage: true, screenshot: full });
    const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
    const rawValue = {
      schema: 'optical-admission-raw-v1', viewport, state: combo.state, deviceScaleFactor: 1, zoom: 1,
      scroll: { x: 0, y: 0 }, fontSettled: true, sourceSha256: 'a'.repeat(64), captureSha256: screenshot.sha256,
      members: [
        { id: `q${index}`, lane: 'Q', kind: 'text', recoveredString: '대기열', rawGraphemeRects: [rect(0, 0, 40, 10)], lineFragments: [rect(0, 0, 40, 10)], clippingChain: [], nativeBounds: null, computed: { fontSize: 16, fontWeight: 700, lineCount: 1, measure: 40, display: 'block', visibility: 'visible', opacity: 1, occluded: false } },
        { id: `i${index}`, lane: 'I', kind: 'text', recoveredString: '소개', rawGraphemeRects: [rect(0, 20, combo.state === 'initial' ? 20 : 15, 10)], lineFragments: [rect(0, 20, combo.state === 'initial' ? 20 : 15, 10)], clippingChain: [], nativeBounds: null, computed: { fontSize: 14, fontWeight: 500, lineCount: 1, measure: 20, display: 'block', visibility: 'visible', opacity: 1, occluded: false } },
      ],
    };
    const rawBytes = Buffer.from(JSON.stringify(rawValue));
    const raw = put(`o${index}-raw.json`, rawBytes);
    const reportProjection = validateOpticalAdmission(rawValue, rawBytes);
    const report = put(`o${index}-report.json`, JSON.stringify(reportProjection));
    optical.push({ evidenceId: `o${index}`, state: combo.state, viewport, raw, report, reportProjection });
  });
  const interactionProjection = {
    schema: 'candidate-interaction-summary-v1', widths: [1280, 390, 320, 195],
    exactCopy: true, nodePreservation: true, containment: true, narrowFirstCrop: true,
    focus: true, recovery: true, reducedMotion: true, noJs: true, clipboard: true, noVacancy: true,
    motion: { sceneCount: 1, durationMs: 320, easing: 'cubic-bezier(0.22,1,0.36,1)', properties: ['transform', 'opacity'], reducedDurationMs: 0, layoutAnimated: false, typeAnimated: false, normalPass: true, reducedPass: true },
  };
  const interaction = { artifact: put('interaction.json', JSON.stringify(interactionProjection)), projection: interactionProjection };
  return { root, packet: { schema: 'anonymous-candidate-review-packet-v1', options: [{ slotId: 'slot-a', primaries, supplements, optical, interaction }] } };
}

test('complete anonymous packet with full receipt projections and byte bindings passes', () => {
  const { root, packet } = fixture();
  assert.deepEqual(validateAnonymousCandidatePacket(root, packet), []);
});

test('packet that omits narrow fixed/full/optical evidence is rejected', () => {
  const { root, packet } = fixture();
  packet.options[0].primaries = packet.options[0].primaries.slice(0, 4);
  packet.options[0].supplements = packet.options[0].supplements.slice(0, 4);
  packet.options[0].optical = packet.options[0].optical.slice(0, 4);
  const findings = validateAnonymousCandidatePacket(root, packet);
  assert.ok(findings.some((finding) => finding.id === 'PACKET_PRIMARY_COVERAGE_INVALID'));
  assert.ok(findings.some((finding) => finding.id === 'PACKET_SUPPLEMENT_COVERAGE_INVALID'));
  assert.ok(findings.some((finding) => finding.id === 'PACKET_OPTICAL_BINDING_INVALID'));
});

test('summary-only receipt projection is rejected before review', () => {
  const { root, packet } = fixture();
  packet.options[0].primaries[0].receiptProjection = { valid: true };
  assert.ok(validateAnonymousCandidatePacket(root, packet).some((finding) => finding.id === 'PACKET_RECEIPT_PROJECTION_INVALID'));
});

test('identity-bearing axis text is rejected even when its artifact binding is current', () => {
  const { root, packet } = fixture();
  const projection = structuredClone(packet.options[0].interaction.projection);
  projection.motion.easing = 'embedded-orientation';
  const bytes = JSON.stringify(projection);
  writeFileSync(join(root, 'interaction.json'), bytes);
  packet.options[0].interaction = { artifact: { path: 'interaction.json', sha256: sha(bytes) }, projection };
  assert.ok(validateAnonymousCandidatePacket(root, packet).some((finding) => finding.id === 'PACKET_IDENTITY_LEAK'));
});

test('non-exact check bytes are rejected even when they parse as an empty array', () => {
  const { root, packet } = fixture();
  const bytes = '[]\n';
  writeFileSync(join(root, 'c0.json'), bytes);
  packet.options[0].primaries[0].check.sha256 = sha(bytes);
  assert.ok(validateAnonymousCandidatePacket(root, packet).some((finding) => finding.id === 'PACKET_CHECK_RESULT_INVALID'));
});

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type { TestContext } from 'node:test';
import type { Reference } from '../../core/types.ts';
import { refIdentity } from '../../core/ref/identity.ts';
import { refImagePath, saveRef } from '../../core/ref/store.ts';
import { createTestProjectWriteAdapter } from './project-write.ts';
import { testSearchReceipt } from './search-execution.ts';

export const admissionHash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const ADMISSION_SOURCE_SHA = 'a'.repeat(64);
export function admissionPng(channel: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, channel, 2, 3]))), chunk('IEND', Buffer.alloc(0))]);
}

export function designAdmissionFixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-design-admission-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd/refs'), { recursive: true });
  const writer = createTestProjectWriteAdapter(root);
  const capturedAt = new Date().toISOString();
  const observedAt = capturedAt.slice(0, 10);
  const receipt = (path: string) => ({ path: relative(root, path), sha256: admissionHash(readFileSync(path)) });
  const capture = (source: string, component: string, lane: 'domain' | 'design', channel: number, links: string[] = []) => {
    const png = admissionPng(channel);
    const image = refImagePath(root, { source, component, researchLane: lane });
    const ref: Reference = {
      source, component, researchLane: lane, kind: 'component', selector: '#hero', capturedAt,
      acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links, imageSha256: admissionHash(png) },
      imagePath: relative(root, image), principles: ['Use measured hierarchy.'],
      invariants: { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] },
      blueprint: { selector: '#hero', capturedAt, nodes: [{ id: 'hero', role: 'container', children: [], box: { w: 120, h: 40 } }] },
    };
    const path = saveRef(root, ref, writer); writeFileSync(image, png);
    return { ref, path, source, evidence: receipt(image), capture: receipt(path) };
  };
  const source = capture('https://visual.example/task', 'hero', 'design', 1);
  const gallery = capture('https://www.pinterest.com/pin/123456789/', 'gallery', 'design', 2, [source.source]);
  const domain = capture('https://domain.example/task', 'domain', 'domain', 3);
  const domainTwo = capture('https://domain-two.example/task', 'domain', 'domain', 4);
  const domainThree = capture('https://domain-three.example/task', 'domain', 'domain', 5);
  const board = {
    schemaVersion: 'reference-board-v1', frameSha256: 'b'.repeat(64),
    candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Measured hierarchy.', pieces: [{
      slotId: 'hero', sourceKind: 'component-capture', referenceId: refIdentity(source.source, 'hero'),
      targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use hierarchy.', take: ['structure'],
      avoid: 'Do not copy branding.', adaptation: 'Use local tokens.',
      evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' },
      grid: { column: 1, span: 12, order: 0 },
    }] }],
  };
  const boardPath = join(root, '.omd/reference-board.json'); writeFileSync(boardPath, JSON.stringify(board));
  const research = {
    schema: 'reference-research-v5', sourceContractSha256: ADMISSION_SOURCE_SHA,
    domainReference: { queries: ['service task'], searches: [testSearchReceipt(root, 'domain', 'service task', [domain.source, domainTwo.source, domainThree.source])],
      sources: [domain, domainTwo, domainThree].map((entry, index) => ({ id: `domain-${index + 1}`, url: entry.source, observedAt, decision: 'Task order', finding: 'Review before submission', evidence: entry.evidence, capture: entry.capture })), benchmarkSha256: null },
    designReference: { queries: ['visual task'], searches: [testSearchReceipt(root, 'design', 'visual task', [gallery.source])],
      sources: [{ id: 'visual', url: source.source, observedAt, decision: 'Visual hierarchy', finding: 'Heading anchors work', evidence: source.evidence, capture: source.capture,
        visualRole: 'visual-direction', visualAssessment: { composition: 'Anchored task', typography: 'Heading contrast', density: 'Compact controls', imagery: 'None', transfer: 'Task hierarchy', avoid: 'Branding' },
        discovery: { url: gallery.source, kind: 'app-gallery', access: 'free', qualityReason: 'Task remains legible.', evidence: gallery.evidence, capture: gallery.capture } }],
      boardSha256: admissionHash(readFileSync(boardPath)) },
  };
  const refreshBoard = () => { writeFileSync(boardPath, JSON.stringify(board)); research.designReference.boardSha256 = admissionHash(readFileSync(boardPath)); };
  return { root, writer, source, gallery, domain, domainTwo, domainThree, capture, receipt, board, boardPath, research, refreshBoard };
}

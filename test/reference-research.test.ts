import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { refIdentity } from '../core/ref/identity.ts';
import {
  parseReferenceResearch,
  validateReferenceResearch,
} from '../core/ref/reference-research.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const SOURCE_SHA = 'a'.repeat(64);
const digest = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');

function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-research-'));
  mkdirSync(join(root, '.omd', 'refs'), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  const source = 'https://design.example/reference';
  const component = 'hero';
  const imagePath = refImagePath(root, { source, component });
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
    source, component, kind: 'component', capturedAt: '2026-09-19T00:00:00.000Z', selector: '#hero',
    invariants, principles: ['Keep the hierarchy independent.'], blueprint, imagePath: relative(root, imagePath),
  };
  saveRef(root, reference, writer);
  writeFileSync(imagePath, PNG);
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
  const domainPath = join(root, '.omd', 'refs', 'domain.png');
  writeFileSync(domainPath, 'domain evidence');
  const research = {
    schema: 'reference-research-v1',
    sourceContractSha256: SOURCE_SHA,
    domainReference: {
      queries: ['field service request flow'],
      sources: [{
        id: 'domain-a', url: 'https://domain.example/service', observedAt: '2026-09-19',
        decision: 'request review sequence', finding: 'review precedes commitment',
        evidence: { path: '.omd/refs/domain.png', sha256: digest('domain evidence') },
      }],
      benchmarkSha256: null,
    },
    designReference: {
      queries: ['editorial hierarchy service landing'],
      sources: [{
        id: 'design-a', url: source, observedAt: '2026-09-19',
        decision: 'hero hierarchy', finding: 'display and proof stay in one measured group',
        evidence: { path: relative(root, imagePath), sha256: digest(PNG) },
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

test('one capture cannot stand in for both domain and design research', t => {
  const value = fixture(t);
  value.research.designReference.sources[0]!.evidence = value.research.domainReference.sources[0]!.evidence;
  assert.throws(() => parseReferenceResearch(value.research), /REFERENCE_RESEARCH_LANE_EVIDENCE_REUSED/);
});

test('a benchmark-selected product route cannot complete with a prose-only domain lane', t => {
  const value = fixture(t);
  const parsed = parseReferenceResearch(value.research);
  assert.throws(() => validateReferenceResearch(value.root, parsed, {
    expectedSourceContractSha256: SOURCE_SHA,
    benchmarkRequired: true,
  }), /REFERENCE_RESEARCH_BENCHMARK_REQUIRED/);
});

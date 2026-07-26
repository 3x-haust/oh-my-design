import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorReferenceBoard } from '../core/ref/board-author.ts';
import { readReferenceBoardArtifacts } from '../core/ref/board-artifacts.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

const invariants: Invariants = { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
const blueprint = (selector: string): Blueprint => ({ selector, capturedAt: '2026-01-01T00:00:00.000Z', nodes: [{ id: selector, role: 'container', children: [], box: { w: 200, h: 80 } }] });

function project(): { root: string; input: unknown } {
  const root = mkdtempSync(join(tmpdir(), 'omd-board-author-'));
  mkdirSync(join(root, '.omd', 'refs'), { recursive: true });
  writeFileSync(join(root, '.omd', 'frame.md'), '# frame\n');
  writeFileSync(join(root, '.omd', 'acquisition-plan.json'), JSON.stringify({ schema: 'reference-acquisition-plan-v1', owner: 'omd-framer', zones: [{ id: 'hero', kind: 'section', job: 'Explain value.', required: true }, { id: 'proof', kind: 'section', job: 'Show evidence.', required: true }] }));
  const adapter = createTestProjectWriteAdapter(root);
  const refs = [
    { source: 'https://example.com/hero', component: 'hero-band', selector: '.hero', slot: 'hero' },
    { source: 'https://example.com/proof', component: 'proof-cards', selector: '.proof', slot: 'proof' },
  ];
  for (const item of refs) {
    const imagePath = refImagePath(root, item);
    const reference: Reference = { ...item, kind: 'component', capturedAt: '2026-01-01T00:00:00.000Z', invariants, principles: [`Principle for ${item.slot}.`], blueprint: blueprint(item.selector), imagePath: relative(root, imagePath) };
    saveRef(root, reference, adapter);
    writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64'));
  }
  const piece = (item: typeof refs[number], order: number) => ({ slotId: item.slot, source: item.source, component: item.component, targetComponent: `${item.slot} section`, targetSelector: `[data-zone="${item.slot}"]`, reason: `Use ${item.slot} evidence.`, take: ['structure', 'rhythm'], avoid: 'Do not copy source identity.', adaptation: 'Apply the measured principle to project copy.', grid: { column: order === 0 ? 1 : 7, span: 6, order }, rights: 'lawful', signal: 'high-visual-system', motionAxis: 'absent' });
  const input = { candidates: [
    { id: 'ledger', label: 'Ledger', route: '/', rationale: 'Evidence-first vertical sequence.', pieces: refs.map(piece) },
    { id: 'atlas', label: 'Atlas', route: '/', rationale: 'Alternating role atlas.', pieces: refs.map((item, index) => piece(item, 1 - index)) },
  ] };
  return { root, input };
}

test('board author derives frame and reference identities then resolves captured evidence', () => {
  const { root, input } = project();
  const board = authorReferenceBoard(root, input);
  assert.equal(board.candidates.length, 2);
  assert.equal(board.candidates[0]?.pieces[0]?.referenceId, refIdentity('https://example.com/hero', 'hero-band'));
  const inputPath = join(root, 'candidate-assemblies.json');
  writeFileSync(inputPath, JSON.stringify(input));
  const command = spawnSync(process.execPath, ['--experimental-strip-types', CLI, 'ref', 'board', '--input', inputPath, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(command.status, 0, command.stderr);
  assert.equal((JSON.parse(command.stdout) as { candidates: number }).candidates, 2);
  const artifacts = readReferenceBoardArtifacts(root);
  assert.equal(artifacts.resolved.candidates.length, 2);
  assert.equal(artifacts.resolved.candidates[0]?.pieces.length, 2);
});

test('board author rejects a candidate that silently drops a required acquisition zone', () => {
  const { root, input } = project();
  const bad = structuredClone(input) as { candidates: { pieces: unknown[] }[] };
  bad.candidates[1]!.pieces.pop();
  assert.throws(() => authorReferenceBoard(root, bad), /does not cover required zones: proof/);
});

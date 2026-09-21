import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { designAdmissionFixture } from './helpers/design-admission.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

test('board publication names an excluded domain source and preserves the board until a design source replaces it', t => {
  const f = designAdmissionFixture(t);
  mkdirSync(join(f.root, '.omd/.cache'), { recursive: true });
  writeFileSync(join(f.root, '.omd/frame.md'), '# Task hierarchy\n');
  writeFileSync(join(f.root, '.omd/acquisition-plan.json'), JSON.stringify({
    schema: 'reference-acquisition-plan-v1', owner: 'omd-framer',
    zones: [{ id: 'hero', kind: 'state', job: 'Anchor the work object', required: true }],
  }));
  const piece = {
    slotId: 'hero', source: f.domain.source, component: f.domain.ref.component,
    targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'],
    reason: 'Anchor the work object', take: ['structure'], avoid: 'Do not copy branding',
    adaptation: 'Use local content', grid: { column: 1, span: 12, order: 0 },
    rights: 'lawful', signal: 'high-visual-system', motionAxis: 'absent',
  };
  const input = { candidates: [
    { id: 'wide', label: 'Wide', route: '/', rationale: 'One work field', pieces: [{ ...piece }] },
    { id: 'rail', label: 'Rail', route: '/', rationale: 'Adjacent context', pieces: [{ ...piece, grid: { column: 1, span: 8, order: 0 } }] },
  ] };
  const inputPath = join(f.root, '.omd/.cache/board-input.json');
  const run = () => spawnSync(process.execPath, [cli, 'ref', 'board', '--input', inputPath, '--json'], { cwd: f.root, encoding: 'utf8' });
  const before = readFileSync(f.boardPath);
  writeFileSync(inputPath, JSON.stringify(input));
  const refused = run();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /candidates\[0\]\.pieces\[0\]\.source.*domain/);
  assert.deepEqual(readFileSync(f.boardPath), before);
  for (const candidate of input.candidates) {
    candidate.pieces[0]!.source = f.source.source;
    candidate.pieces[0]!.component = 'uncaptured-name';
  }
  writeFileSync(inputPath, JSON.stringify(input));
  const unknown = run();
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /candidates\[0\]\.pieces\[0\].*ref list --lane design --json/);
  assert.deepEqual(readFileSync(f.boardPath), before);
  for (const candidate of input.candidates) candidate.pieces[0]!.component = f.source.ref.component;
  writeFileSync(inputPath, JSON.stringify(input));
  const accepted = run();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(readFileSync(f.boardPath, 'utf8')).candidates.length, 2);
});

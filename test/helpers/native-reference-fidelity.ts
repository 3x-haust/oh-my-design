import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { canonicalJson } from '../../core/ref/board-artifacts.ts';
import { selectReferenceCandidateV2 } from '../../core/ref/reference-selection.ts';
import { designAdmissionFixture } from './design-admission.ts';
import { createTestProjectRunInvocation } from './project-write.ts';

export function installNativeFidelityReferences(t: TestContext, root: string): void {
  const source = designAdmissionFixture(t);
  cpSync(join(source.root, '.omd/refs'), join(root, '.omd/refs'), { recursive: true });
  const board = JSON.parse(readFileSync(join(source.root, '.omd/reference-board.json'), 'utf8'));
  board.candidates[0].id = 'selected';
  board.candidates[0].pieces[0].slotId = 'hero-card';
  const rejected = structuredClone(board.candidates[0].pieces[0]);
  rejected.slotId = 'rejected-slot';
  rejected.grid.order = 1;
  board.candidates[0].pieces.push(rejected);
  const unused = structuredClone(board.candidates[0]);
  unused.id = 'unselected-candidate';
  board.candidates.push(unused);
  writeFileSync(join(root, '.omd/reference-board.json'), canonicalJson(board));
  selectReferenceCandidateV2(root, 'selected', [
    { slotId: 'hero-card', obligationDisposition: 'used', obligationReason: 'Selected visual direction.' },
    { slotId: 'rejected-slot', obligationDisposition: 'rejected', obligationReason: 'Rejected alternative.' },
  ], createTestProjectRunInvocation(root));
}

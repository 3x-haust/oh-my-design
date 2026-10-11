import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { artDirectionSha256, validateArtDirectionPointer, validateArtDirectionRecord } from './schema.ts';
import { validateCopyDeck, validateCopyDeckV2AgainstSelectedArtDirection } from '../copy/index.ts';
import { readCurrentCandidateSelection } from '../brief/candidate-choice.ts';
import { readBytes, digest } from '../brief/candidate-data.ts';
import { directionRoute } from '../brief/candidate-choice.ts';
import { isSelectedArtDirection, readSelectedArtDirection, selectedArtCopyProjection } from './selected.ts';

/** Writer may close art/Beat metadata after direction without changing the selected visible copy.
 * No art record means missing-settlement debt; a purported current record must actually close. */
export function selectedDirectionCopyClosureProblems(root: string): string[] {
  if (!existsSync(join(root, '.omd/art-direction.json'))) return [];
  try {
    readCurrentCandidateSelection(root);
    if (isSelectedArtDirection(root)) {
      const record = readSelectedArtDirection(root, directionRoute(root).sourceContractSha256);
      const deck = readBytes(root, '.omd/copy-deck.md').toString('utf8');
      const blocks = [...deck.matchAll(/^## Selected direction\s*\n\s*```json\s*\n([\s\S]*?)\n```/gm)];
      const problems = validateCopyDeck(deck).map(finding => finding.message);
      if ([...deck.matchAll(/^## Selected direction\s*$/gm)].length !== 1 || blocks.length !== 1
        || digest(JSON.parse(blocks[0]![1]!)) !== digest(selectedArtCopyProjection(record))) problems.push('Selected direction copy-safe metadata must match the current art-direction-v3 projection exactly.');
      return problems;
    }
    const pointer = validateArtDirectionPointer(JSON.parse(readBytes(root, '.omd/art-direction.json').toString('utf8')));
    const record = validateArtDirectionRecord(JSON.parse(readBytes(root, `.omd/${pointer.record}`).toString('utf8')));
    if (artDirectionSha256(record) !== pointer.sha256) throw new Error('Legacy art-direction record digest changed.');
    const deck = readBytes(root, '.omd/copy-deck.md').toString('utf8');
    return [...validateCopyDeck(deck), ...validateCopyDeckV2AgainstSelectedArtDirection(deck, {
      selectedRegister: record.decision.selectedRegister, motionDecision: record.decision.motionDecision,
      beatIds: record.beatIds, currentUserBeatExceptionReceiptSha256: record.decision.currentUserBeatExceptionReceiptSha256,
    })].map(finding => finding.message);
  } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
}

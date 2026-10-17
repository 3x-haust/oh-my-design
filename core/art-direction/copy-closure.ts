import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { artDirectionSha256, validateArtDirectionPointer, validateArtDirectionRecord } from './schema.ts';
import { validateCopyDeck, validateCopyDeckV2AgainstSelectedArtDirection } from '../copy/index.ts';
import { readCurrentCandidateSelection } from '../brief/candidate-choice.ts';
import { readBytes, readReceipt, digest } from '../brief/candidate-data.ts';
import { directionRoute } from '../brief/candidate-choice.ts';
import { isSelectedArtDirection, readSelectedArtDirection, selectedArtCopyProjection } from './selected.ts';

function selectedRouteRequiresCopyClosure(root: string, sourceContractSha256: string): boolean {
  const source = JSON.parse(readReceipt(root, {
    path: `.omd/route-sources/sha256-${sourceContractSha256}.json`,
    sha256: sourceContractSha256,
  }).toString('utf8')) as unknown;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Selected direction route source is malformed.');
  const strategy = Reflect.get(source, 'strategyDecision') as unknown;
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) throw new Error('Selected direction route strategy is malformed.');
  const stages = Reflect.get(strategy, 'stages') as unknown;
  if (!Array.isArray(stages) || stages.some(stage => typeof stage !== 'string')) throw new Error('Selected direction route stages are malformed.');
  return stages.includes('copy') || stages.includes('safety-validation');
}

/** Writer may close art/Beat metadata after direction without changing the selected visible copy.
 * No art record means missing-settlement debt; a purported current record must actually close. */
export function selectedDirectionCopyClosureProblems(root: string): string[] {
  if (!existsSync(join(root, '.omd/art-direction.json'))) return [];
  try {
    readCurrentCandidateSelection(root);
    if (isSelectedArtDirection(root)) {
      const route = directionRoute(root);
      const record = readSelectedArtDirection(root, route.sourceContractSha256);
      if (!existsSync(join(root, '.omd/copy-deck.md'))
        && !selectedRouteRequiresCopyClosure(root, route.sourceContractSha256)) return [];
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

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CURRENT_CANDIDATE_PATH, directionRoute, parseCandidatePointerV2, parseCandidateSelection } from '../brief/candidate-choice.ts';
import { parseCandidatePlan, parseCandidateSet } from '../brief/candidate-plan.ts';
import { resolveSelectedTokens } from '../tokens/resolve.ts';
import { fileReceipt, readReceipt } from '../brief/candidate-data.ts';

/** Seed captures stay provisional. Once an authenticated current-process choice exists, every
 * production measurement consumes its effective system, including signed additive extensions. */
export function currentSelectedSystem(root: string) {
  if (!existsSync(resolve(root, '.omd/route-source.json')) || !existsSync(resolve(root, CURRENT_CANDIDATE_PATH))) return null;
  const route = directionRoute(root);
  if (!route.processPolicy || !route.conceptSelected) return null;
  const pointer = parseCandidatePointerV2(JSON.parse(readReceipt(root, fileReceipt(root, CURRENT_CANDIDATE_PATH)).toString('utf8')));
  const selection = parseCandidateSelection(JSON.parse(readReceipt(root, pointer.selection).toString('utf8')));
  // The resolver authenticates the current choice and checks exact supplied-selection equality.
  const tokens = resolveSelectedTokens(root, selection);
  const set = parseCandidateSet(JSON.parse(readReceipt(root, selection.candidateSet).toString('utf8')));
  const plan = parseCandidatePlan(JSON.parse(readReceipt(root, set.plan).toString('utf8')));
  const content = JSON.parse(readReceipt(root, plan.content.receipt).toString('utf8')) as { units: { id: string; roleId: string }[] };
  return { selection, tokens, representative: plan.representative,
    assignments: Object.fromEntries(content.units.map(u => [u.id, u.roleId])),
    receipts: [fileReceipt(root, CURRENT_CANDIDATE_PATH), fileReceipt(root, '.omd/tokens.json'),
      ...['.omd/token-extensions.json', '.omd/token-extension-receipt.json'].filter(path => existsSync(resolve(root, path))).map(path => fileReceipt(root, path))] };
}

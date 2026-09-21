import { join } from 'node:path';
import { lstatSync } from 'node:fs';
import { buildBrief } from '../brief/index.ts';
import { CANDIDATE_SELECTION_POINTER_PATH, resolveCandidateSelection, validateCandidateSelectionPointer } from '../brief/candidate-selection.ts';
import { readFrame } from '../frame/index.ts';
import { checkFrameUx } from '../frame/check-ux.ts';
import { validateCopyDeck, validateCurrentCopyReview } from '../copy/index.ts';
import { validateCurrentCompositionContract } from '../composition-contract/index.ts';
import { readReferenceBoardArtifacts, sha256 } from '../ref/board-artifacts.ts';
import { requireDesignJudgmentForReferences } from '../design/judgment-files.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute, pathsOutsideScope } from '../route/index.ts';
import { resolveRunState, requireConfirmedPlanningForProduction } from '../stage/contract.ts';
import type { ProjectRunInvocation } from './invocation.ts';

export type ProductionReadiness = Readonly<{
  schema: 'production-readiness-v1'; ok: boolean; blockers: readonly string[];
}>;

/** Pre-source checks only: final renders/seals cannot exist before initial implementation.
 * Resolve the authenticated route pointer, never a caller-supplied role or projectMode stub.
 * Contract delivery and file presence are prerequisites, not proof of valid content.
 */
export function checkProductionReadiness(
  root: string, invocation: ProjectRunInvocation, packRoot: string, target?: string | readonly string[],
): ProductionReadiness {
  const blockers: string[] = [];
  const attempt = (label: string, check: () => void): void => {
    try { check(); } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      blockers.push(`${label}: ${reason}${label === 'route' ? ' — run route validate then route classify from the current user-approved scope with this installed build; never hand-edit authority or request an external Pi activation file' : ''}`);
    }
  };
  attempt('route', () => {
    const route = readPersistedRoute(root, invocation);
    if (route.deliveryMode === 'design-only' || !route.strategy.stages.includes('production')) {
      blockers.push('production is not selected; finish the design handoff without application writes');
    }
    const targets = target === undefined ? [] : typeof target === 'string' ? [target] : target;
    const outside = pathsOutsideScope(route, targets);
    for (const path of outside) {
      blockers.push(`target is outside the current route: ${path}`);
    }
    for (const path of targets.filter(path => !outside.includes(path))) {
      attempt('source target', () => {
        let current = root;
        for (const part of path.split('/')) {
          current = join(current, part);
          try {
            if (lstatSync(current).isSymbolicLink()) throw new Error(`symlink target/ancestor is not permitted: ${path}`);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      });
    }
    attempt('production brief', () => { blockers.push(...buildBrief(root, 'production', packRoot, invocation).blockers); });
    attempt('planning', () => {
      const missing = requireConfirmedPlanningForProduction(root);
      if (missing.length) blockers.push(`unconfirmed planning: ${missing.join(', ')}`);
    });
    attempt('selected stages', () => {
      const state = resolveRunState(root, packRoot, invocation);
      for (const stage of state.stages) {
        attempt(stage.stage, () => {
          const bytes = readContainedRegularFile(root, join(root, stage.artifact), stage.artifact);
          if (!bytes.toString('utf8').trim()) throw new Error(`${stage.artifact} is empty`);
        });
        for (const contract of stage.undelivered) {
          blockers.push(`contract not delivered: omd stage deliver --stage ${stage.stage} --contract ${contract}`);
        }
      }
    });
    if (route.strategy.stages.includes('frame')) {
      attempt('frame UX', () => { blockers.push(...checkFrameUx(root).map(f => `frame UX: ${f.message}`)); });
    }
    if (route.strategy.stages.includes('frame') && route.sourceContract.referenceDiscovery.taskNeed === 'new-product') {
      attempt('product frame', () => {
        const frame = readFrame(root);
        if (frame?.uxSurface !== 'product' && frame?.uxSurface !== 'mixed') {
          throw new Error('new-product requires product/mixed UX framing; repair task coverage, do not relabel it editorial');
        }
      });
    }
    if (route.strategy.stages.includes('copy')) {
      attempt('copy', () => {
        const deck = readContainedRegularFile(root, join(root, '.omd/copy-deck.md'), 'copy deck');
        blockers.push(...validateCopyDeck(deck.toString('utf8')).map(f => `copy: ${f.message}`));
        if (route.behavior.active.copyRepairWorkflow.status === 'selected') {
          const review = readContainedRegularFile(root, join(root, '.omd/.cache/copy-eye.md'), 'copy review');
          blockers.push(...validateCurrentCopyReview(review.toString('utf8'), deck).map(f => `copy review: ${f.message}`));
        }
      });
    }
    if (route.strategy.stages.includes('reference-board')) {
      attempt('reference board/judgment', () => {
        const board = readReferenceBoardArtifacts(root);
        requireDesignJudgmentForReferences(root, sha256(board.boardBytes));
      });
    }
    if (route.strategy.stages.includes('composition')) {
      attempt('composition', () => {
        blockers.push(...validateCurrentCompositionContract(root, invocation).map(f => `composition: ${f.message}`));
      });
    }
    if (route.strategy.stages.includes('candidate-generation')) {
      attempt('selected candidate', () => {
        const bytes = readContainedRegularFile(root, join(root, CANDIDATE_SELECTION_POINTER_PATH), 'current candidate selection');
        const paths = resolveCandidateSelection(root, validateCandidateSelectionPointer(JSON.parse(bytes.toString('utf8'))));
        for (const path of paths) {
          if (!readContainedRegularFile(root, join(root, path), path).toString('utf8').trim()) throw new Error(`${path} is empty`);
        }
      });
    }
  });
  return { schema: 'production-readiness-v1', ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

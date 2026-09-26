import { join } from 'node:path';
import { existsSync, lstatSync } from 'node:fs';
import { buildBrief } from './index.ts';
import { readFrame } from '../frame/index.ts';
import { checkFrameUx } from '../frame/check-ux.ts';
import { validateCopyDeck, validateCurrentCopyReview } from '../copy/index.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute, pathsOutsideScope } from '../route/index.ts';
import { resolveRunState, requireConfirmedPlanningForProduction } from '../stage/contract.ts';
import { stageArtifactProblems } from '../stage/output.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { confidenceDebt, DEBT_CAPABLE_STAGES, mergeConfidenceDebt, recordConfidenceDebt, type ConfidenceDebt } from './confidence-debt.ts';
import { compositionEntry } from './minimal-composition.ts';

export type ProductionReadiness = Readonly<{
  schema: 'production-readiness-v1'; ok: boolean; blockers: readonly string[]; confidenceDebt: readonly ConfidenceDebt[];
}>;

/** Entry permission is not terminal acceptance. Failed authority/frame/safety checks never mutate. */
export function checkProductionReadiness(root: string, invocation: ProjectRunInvocation, packRoot: string,
  target?: string | readonly string[]): ProductionReadiness {
  const blockers: string[] = [], debt: ConfidenceDebt[] = [];
  const attempt = (label: string, check: () => void): void => {
    try { check(); } catch (error) { blockers.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  let sourceContractSha256: string | undefined;
  attempt('route', () => {
    const route = readPersistedRoute(root, invocation);
    sourceContractSha256 = route.sourceContractSha256;
    if (route.deliveryMode === 'design-only' || !route.strategy.stages.includes('production')) {
      blockers.push('production is not selected; finish the design handoff without application writes');
    }
    const targets = target === undefined ? [] : typeof target === 'string' ? [target] : target;
    const outside = pathsOutsideScope(route, targets);
    for (const path of outside) blockers.push(`target is outside the current route: ${path}`);
    for (const path of targets.filter(path => !outside.includes(path))) attempt('source target', () => {
      let current = root;
      for (const part of path.split('/')) {
        current = join(current, part);
        try { if (lstatSync(current).isSymbolicLink()) throw new Error(`symlink target/ancestor is not permitted: ${path}`); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
    });
    attempt('production brief', () => {
      const brief = buildBrief(root, 'production', packRoot, invocation);
      blockers.push(...brief.blockers);
      debt.push(...brief.confidenceDebt);
    });
    attempt('planning', () => {
      const missing = requireConfirmedPlanningForProduction(root);
      if (missing.length) blockers.push(`unconfirmed planning: ${missing.join(', ')}`);
    });
    const safety = route.strategy.stages.includes('safety-validation');
    const provisionalCopy = route.projectMode === 'greenfield' && !safety;
    attempt('selected stages', () => {
      for (const stage of resolveRunState(root, packRoot, invocation).stages) {
        const canYield = DEBT_CAPABLE_STAGES.has(stage.stage) || (stage.stage === 'copy' && provisionalCopy && !stage.present);
        const problems = stage.stage === 'composition' ? [] : stageArtifactProblems(root, stage.stage, invocation);
        const delivery = stage.undelivered.map(contract => `contract not delivered: omd stage deliver --stage ${stage.stage} --contract ${contract}`);
        if (canYield) debt.push(...[...problems, ...delivery].map(reason => confidenceDebt(stage.stage, reason)));
        else {
          // Copy review absence is debt only before a review exists; a stale/REVISE verdict is not.
          if (stage.stage !== 'copy') blockers.push(...problems.map(reason => `${stage.stage}: ${reason}`));
          blockers.push(...delivery);
        }
      }
    });
    if (route.strategy.stages.includes('frame')) {
      attempt('frame UX', () => { blockers.push(...checkFrameUx(root).map(f => `frame UX: ${f.message}`)); });
      if (route.sourceContract.referenceDiscovery.taskNeed === 'new-product') attempt('product frame', () => {
        const frame = readFrame(root);
        if (frame?.uxSurface !== 'product' && frame?.uxSurface !== 'mixed') throw new Error('new-product requires product/mixed UX framing; do not relabel it editorial');
      });
    }
    if (route.strategy.stages.includes('copy') || safety) attempt(safety ? 'safety-validation' : 'copy', () => {
      const copyPath = join(root, '.omd/copy-deck.md');
      if (!existsSync(copyPath) && provisionalCopy) {
        debt.push(confidenceDebt('copy', 'copy deck has not completed; implement only frame-authorized facts'));
        return;
      }
      const deck = readContainedRegularFile(root, copyPath, 'copy deck');
      blockers.push(...validateCopyDeck(deck.toString('utf8')).map(f => `copy: ${f.message}`));
      if (safety || route.behavior.active.copyRepairWorkflow.status === 'selected') {
        const reviewPath = join(root, '.omd/.cache/copy-eye.md');
        if (!existsSync(reviewPath) && !safety) debt.push(confidenceDebt('copy', 'copy review has not completed; no CLEAN claim is authorized'));
        else {
          const review = readContainedRegularFile(root, reviewPath, 'copy review');
          blockers.push(...validateCurrentCopyReview(review.toString('utf8'), deck).map(f => `copy review: ${f.message}`));
        }
      }
    });
    if (route.strategy.stages.includes('composition')) {
      const composition = compositionEntry(root, invocation);
      blockers.push(...composition.blockers);
      debt.push(...composition.debt.map(reason => confidenceDebt('composition', `Full composition deferred: ${reason}`)));
    }
  });
  const unique = [...new Set(blockers)];
  const items = mergeConfidenceDebt(debt);
  const recorded = !unique.length && sourceContractSha256 !== undefined
    ? recordConfidenceDebt(root, sourceContractSha256, items, invocation) : items;
  return { schema: 'production-readiness-v1', ok: unique.length === 0, blockers: unique, confidenceDebt: recorded };
}

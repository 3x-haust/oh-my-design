import { join } from 'node:path';
import { lstatSync } from 'node:fs';
import { pathsOutsideScope, readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { projection, requireCopyToneReview } from '../design-language/index.ts';
import { nativeReframeWork } from '../runtime/native-reframe.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import type { ConfidenceDebt } from './confidence-debt.ts';
import { newSurfaceAdvisories } from '../design/new-surface-advisories.ts';

export type ProductionReadiness = Readonly<{
  schema: 'production-readiness-v1';
  ok: boolean;
  blockers: readonly string[];
  confidenceDebt: readonly ConfidenceDebt[];
  warnings: readonly string[];
  sourceAuthoring: 'model';
}>;

/** Model-led production entry checks authority, scope and current interpretation only. */
export function checkProductionReadiness(
  root: string,
  invocation: ProjectRunInvocation,
  _packRoot: string,
  target?: string | readonly string[],
): ProductionReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const attempt = (label: string, check: () => void): void => {
    try { check(); }
    catch (error) { blockers.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  attempt('route', () => {
    const route = readPersistedRoute(root, invocation);
    if (!isModelLedProcess(route.sourceContract)) throw new Error('LEGACY_STRUCTURED_PROCESS_UNSUPPORTED');
    if (!route.strategy.stages.includes('production')) throw new Error('production is not selected');
    const language = projection(root, route);
    if (language?.status === 'needs-clarification') throw new Error('DESIGN_LANGUAGE_AMBIGUOUS');
    if (language?.status === 'resolved' && !language.targets.length && !language.copyTone) {
      throw new Error('DESIGN_LANGUAGE_UNGROUNDED');
    }
    requireCopyToneReview(root, route);
    const targets = target === undefined ? [] : typeof target === 'string' ? [target] : target;
    const outside = pathsOutsideScope(route, targets);
    for (const path of outside) blockers.push(`target is outside the current route: ${path}`);
    for (const path of targets.filter(path => !outside.includes(path))) {
      let current = root;
      for (const part of path.split('/')) {
        current = join(current, part);
        try {
          if (lstatSync(current).isSymbolicLink()) throw new Error(`symlink target/ancestor is not permitted: ${path}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
    const reframe = nativeReframeWork(root, invocation);
    if (reframe !== null) warnings.push(`${reframe.problems.join('; ')}; ${reframe.next}`);
    warnings.push(...newSurfaceAdvisories(root, route));
  });
  const unique = [...new Set(blockers)];
  return {
    schema: 'production-readiness-v1',
    ok: unique.length === 0,
    blockers: unique,
    confidenceDebt: [],
    warnings,
    sourceAuthoring: 'model',
  };
}

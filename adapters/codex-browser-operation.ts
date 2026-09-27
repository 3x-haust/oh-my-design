import { readCurrentBrowseEvidence } from '../core/ref/browse/evidence.ts';
import { browseDiscoveryWork } from '../core/ref/browse/work.ts';

export {
  CODEX_BROWSER_ROLES,
  brokeredBrowserOperationNames,
  codexBrowserRoleFromEnvironment,
  isBrokeredBrowserCliOperation,
  type CodexBrowserRole,
} from '../core/runtime/codex-browser-operation.ts';

export type VerifiedCodexBrowseProgress = Readonly<{
  sessionCount: number;
  sealedSessionCount: number;
  actionsUsed: number;
  actionLimit: number;
  actionsRemaining: number;
  metadataEvents: number;
  keeps: number;
  failedOrRefusedActions: number;
  deadline: string | null;
  stoppedWithDebt: boolean;
}>;

/**
 * Reads only native-verified browse sessions/checkpoints. The budget is cycle-cumulative, so the
 * latest verified counter wins; summing per-session counters would charge the same actions again
 * after a lane restart.
 */
export function verifiedCodexBrowseProgress(
  root: string,
  route: Readonly<{ sourceContractSha256: string }>,
): VerifiedCodexBrowseProgress {
  const sealed = readCurrentBrowseEvidence(root, route.sourceContractSha256);
  const work = browseDiscoveryWork(root, route);
  const budget = work.browse?.budget ?? sealed.at(-1)?.verified.seal.budget ?? null;
  const keeps = sealed.reduce((total, item) => total + item.verified.seal.keeps.length, 0);
  const failedOrRefusedActions = sealed.reduce((total, item) => total
    + item.verified.events.filter(event => event.outcome === 'failed' || event.outcome === 'rejected' || event.outcome === 'blocked').length, 0);
  const hasLiveSession = work.action?.kind === 'continue-browse'
    || (work.action?.kind === 'end-browse' && work.action.lane !== null);
  return Object.freeze({
    sessionCount: sealed.length + (hasLiveSession ? 1 : 0),
    sealedSessionCount: sealed.length,
    actionsUsed: budget?.actions ?? 0,
    actionLimit: budget?.maxActions ?? 0,
    actionsRemaining: budget === null ? 0 : Math.max(0, budget.maxActions - budget.actions),
    metadataEvents: budget?.metadataEvents ?? 0,
    keeps,
    failedOrRefusedActions,
    deadline: budget?.deadline ?? null,
    stoppedWithDebt: work.status === 'stopped-with-debt',
  });
}

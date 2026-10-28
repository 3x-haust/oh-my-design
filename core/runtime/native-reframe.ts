import { piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { readFirstRenderReview } from '../design/first-render-review.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute } from '../route/index.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import type { ProjectRunInvocation } from './invocation.ts';

export function nativeReframeWork(root: string, invocation: ProjectRunInvocation) {
  const review = readFirstRenderReview(root);
  if (review === null || review.decision !== 'reframe') return null;
  if (review.bindings.buildSha256 !== invocation.current.buildSha256
    || review.bindings.briefSha256 !== invocation.current.briefSha256) {
    throw new Error('NATIVE_REFRAME_LINEAGE_STALE');
  }
  const route = readPersistedRoute(root, invocation);
  if (!isModelLedProcess(route.sourceContract)) {
    throw new Error('LEGACY_STRUCTURED_PROCESS_UNSUPPORTED');
  }
  const report = piRecord(JSON.parse(readContainedRegularFile(
    root,
    `.omd/first-render/reports/${review.bindings.captureReportSha256}.json`,
    'model-led reframe report',
  ).toString('utf8')), 'model-led-reframe-report');
  return {
    stage: 'production' as const,
    owner: 'coordinator',
    action: 'repair-model-led-render',
    next: `omd first-render check --page ${JSON.stringify(piText(report.page, 'reframe-page'))} --json`,
    instruction: 'Repair direction and composition directly within the current production scope, rebuild, and independently re-review against the preserved findings and failed baselines.',
    problems: ['NATIVE_REFRAME_REVIEW_REQUIRED'],
    repair: { reviewSha256: review.sha256, findings: review.findings, baselines: review.baselines },
  };
}

export function requireResolvedNativeReframe(root: string, invocation: ProjectRunInvocation): void {
  const work = nativeReframeWork(root, invocation);
  if (work !== null) throw new Error(`NATIVE_REFRAME_UNRESOLVED:${work.action}; ${work.next}`);
}

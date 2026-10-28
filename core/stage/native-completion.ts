import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkTerminalCompletion } from '../completion/preflight.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import { finalRenderReviewerPacket } from '../runtime/final-render-review.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { currentNativeFinalObservations } from '../runtime/native-final-manifest.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { nativeReframeWork, requireResolvedNativeReframe } from '../runtime/native-reframe.ts';

export function checkNativeBrowserEvidence(root: string, invocation: ProjectRunInvocation) {
  getNativePiRun(invocation, root);
  requireResolvedNativeReframe(root, invocation);
  const route = readPersistedRoute(root, invocation);
  if (!isModelLedProcess(route.sourceContract)) throw new Error('LEGACY_STRUCTURED_PROCESS_UNSUPPORTED');
  const observations = currentNativeFinalObservations(root);
  finalRenderReviewerPacket({
    root,
    invocation,
    packetInput: {
      schema: 'adaptive-final-render-reviewer-packet-input-v1',
      observationSha256s: observations.map(item => item.receipt.sha256),
    },
  });
  return { observations: observations.map(item => item.receipt) };
}

export function nativeCompletionWork(root: string, invocation: ProjectRunInvocation) {
  getNativePiRun(invocation, root);
  const route = readPersistedRoute(root, invocation);
  if (!isModelLedProcess(route.sourceContract)) {
    return {
      stage: 'unsupported',
      owner: 'coordinator',
      action: 'stop-blocked',
      next: null,
      instruction: 'Historical structured routes cannot resume production.',
      problems: ['LEGACY_STRUCTURED_PROCESS_UNSUPPORTED'],
    };
  }
  const reframe = nativeReframeWork(root, invocation);
  if (reframe !== null) return reframe;
  try {
    checkTerminalCompletion(root, invocation);
    return {
      stage: null,
      owner: 'coordinator',
      action: 'validate-selected-gates',
      next: 'omd guard completion --json',
      instruction: 'Report the actual result and limitations.',
      problems: [],
    };
  } catch {
    const plan = existsSync(resolve(root, '.omd/.cache/trusted-lifecycle-manifest.json'));
    return {
      stage: 'browser-evidence' as const,
      owner: 'coordinator',
      action: plan ? 'finish-model-led' : 'author-browser-plan',
      next: plan ? 'omd lifecycle finish --json' : 'omd schema trusted-lifecycle-manifest --json',
      instruction: plan
        ? 'Run package checks, real browser actions, isolated review, and final publication together. Repair concrete returned failures.'
        : 'Author one browser proposal from the actual built controls and requested outcomes.',
      problems: [],
    };
  }
}

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import type { Reference } from '../../core/types.ts';
import type { ProjectRunInvocation } from '../../core/runtime/invocation.ts';
import { createTestNativePiInvocation } from '../../core/runtime/native-pi-run.ts';
import { runPiReferenceAdmissionReviewer } from '../../adapters/pi-reviewer-runtime.ts';
import { buildReferenceDirectionReviewerPacket, publishReferenceDirectionAdmission } from '../../core/ref/reference-direction-admission.ts';
import { createTestProjectWriteAdapter } from './project-write.ts';
import { admissionHash } from './design-admission.ts';

export async function admitBrowseDirections(t: TestContext, root: string, invocation: ProjectRunInvocation,
  current: Readonly<{ sourceContractSha256: string; request: string }>, references: readonly Reference[]) {
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('../fixtures/pi-reviewer-rpc.mjs', import.meta.url));
  const native = createTestNativePiInvocation({ root, current: invocation.current, host: {
    nodePath, nodeSha256: admissionHash(readFileSync(nodePath)), cliPath, cliSha256: admissionHash(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'browse-consumer-parent',
  } });
  const mode = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'reference-direction';
  try {
    const packet = buildReferenceDirectionReviewerPacket(root, {
      sourceContractSha256: current.sourceContractSha256, task: current.request, references,
    });
    const result = await runPiReferenceAdmissionReviewer({ root, invocation: native, packet, signal: t.signal });
    return publishReferenceDirectionAdmission(root, packet, result, native, createTestProjectWriteAdapter(root, native));
  } finally {
    if (mode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = mode;
  }
}

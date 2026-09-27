import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDesignJudgment } from './judgment-files.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { measureProject } from '../measure/index.ts';
import { loadMeasurement } from '../measure/files.ts';
import { canonicalBytes, digest } from '../measure/identity.ts';
import { readArtifact } from '../measure/inputs.ts';
import { critiqueMeasuredFirstRender } from './first-render-measurement.ts';

const PATH = '.omd/first-render-critic.json';
const fail = (message: string): never => { throw new Error(`FIRST_RENDER_REQUIRED: ${message}; rerun first-render check --page <local-build.html>`); };
/** The old surface argument is retained only to issue an explicit migration refusal. */
export async function publishFirstRenderCheck(root: string, page: string, input: unknown, writer: ProjectWriteAdapter, invocation?: ProjectRunInvocation) {
  if (input !== undefined) return fail('agent-authored surfaces cannot publish measurement-derived evidence; remove --input');
  if (!invocation) return fail('current invocation is required');
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const hypothesis = readDesignJudgment(root)?.hypothesis ?? fail('current design hypothesis is missing');
  const result = await measureProject({ root, entry: page, writer, invocation });
  const packet = loadMeasurement(root, result.packet);
  const native = { schema: 'first-render-check-v3' as const, page, measurements: [result.packet], sourceSha256: packet.binding.sourceSha256, buildSha256: packet.binding.production[0]!.servedTreeSha256,
    hypothesisSha256: digest(hypothesis), report: critiqueMeasuredFirstRender(hypothesis, packet, result.packet), interpretation: 'native-measurement-derived' as const };
  const record = { ...native, signature: signNativeObservation(realpathSync(root), 'first-render-v3', digest(native)) };
  const reportSha256 = digest(record), body = canonicalBytes({ ...record, reportSha256 });
  const unlock = acquireProjectMutationLock(root, invocation);
  try {
    loadMeasurement(root, result.packet);
    if (digest(readDesignJudgment(root)?.hypothesis) !== digest(hypothesis)) return fail('hypothesis changed during capture');
    writer.writeContentAddressed(`.omd/first-render/reports/${reportSha256}.json`, body);
    replaceProjectFileAtomically({ projectRoot: root, relativePath: PATH, content: body, invocation });
  } finally { unlock(); }
  return { ...record, reportSha256 };
}
/** Historical v2 is inspectable as JSON, but cannot authorize a new measured completion. */
export function checkFirstRenderEvidence(root: string) {
  if (!existsSync(resolve(root, PATH))) {
    if (existsSync(resolve(root, '.omd/design-judgment.json'))) return fail('report is missing');
    return null;
  }
  const bytes = readArtifact(root, PATH), { reportSha256, ...record } = JSON.parse(bytes.toString('utf8'));
  if (record.schema !== 'first-render-check-v3' || typeof reportSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(reportSha256) || digest(record) !== reportSha256) return fail('legacy-unmeasured or invalid report');
  if (!bytes.equals(readArtifact(root, `.omd/first-render/reports/${reportSha256}.json`))) return fail('immutable report differs');
  const { signature, ...native } = record;
  if (typeof signature !== 'string' || !verifyNativeObservation(realpathSync(root), 'first-render-v3', digest(native), signature)) return fail('native report signature invalid');
  if (!Array.isArray(record.measurements) || record.measurements.length !== 1) return fail('measurement receipt required');
  const packet = loadMeasurement(root, record.measurements[0]);
  const hypothesis = readDesignJudgment(root)?.hypothesis ?? fail('hypothesis is missing');
  if (record.hypothesisSha256 !== digest(hypothesis) || digest(record.report) !== digest(critiqueMeasuredFirstRender(hypothesis, packet, record.measurements[0]))) return fail('hypothesis or measured critic result changed');
  if (record.sourceSha256 !== packet.binding.sourceSha256 || record.buildSha256 !== packet.binding.production[0]?.servedTreeSha256 || record.report.verdict !== 'retain') return fail('critical findings or stale source/build remain');
  return record;
}

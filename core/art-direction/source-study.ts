import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import { verifySignedPiStudyResult } from '../runtime/pi-study-receipt.ts';
import { runPiSourceStudy } from '../../adapters/pi-study-runtime.ts';
import { parseSourceStudyPacket, SOURCE_STUDY_TASK, SourceStudyContractError } from '../../adapters/pi-study-contract.ts';
import { sourceStudyPackets } from './source-study-packet.ts';
import { renderSourceStudyHtml } from './source-study-render.ts';
import {
  readSourceStudySet, readSelectedSourceStudy, SOURCE_STUDY_BASE,
  SOURCE_STUDY_CURRENT, SOURCE_STUDY_LATEST, SOURCE_STUDY_SELECTION_SCHEMA, SOURCE_STUDY_SET_SCHEMA,
} from './source-study-records.ts';

export { readSelectedSourceStudy, readSourceStudySet, readLatestSourceStudySet } from './source-study-records.ts';
const fail = (reason: string): never => { throw new SourceStudyContractError(reason); };

export async function createSourceStudySet(
  root: string, invocation: ProjectRunInvocation, input: unknown, signal?: AbortSignal,
) {
  const run = getNativePiRun(invocation, root);
  const prepared = sourceStudyPackets(root, invocation, input);
  const abort = new AbortController();
  const combined = signal === undefined ? abort.signal : AbortSignal.any([signal, abort.signal]);
  const pending = prepared.packets.map(async packet => {
    const roleResult = await runPiSourceStudy({ root, invocation, packet: packet.bytes, signal: combined });
    const verified = verifySignedPiStudyResult(roleResult, root);
    const expected = parseSourceStudyPacket(packet.bytes).outputContract.fixedBindings;
    if (canonicalJson(verified.receipt.fixedBindings) !== canonicalJson(expected)
      || verified.receipt.studyEvidence.packetSha256 !== sha256(packet.bytes)
      || verified.receipt.taskSha256 !== sha256(SOURCE_STUDY_TASK)
      || verified.receipt.provider !== run.host.provider || verified.receipt.model !== run.host.model) {
      return fail('execution-binding');
    }
    combined.throwIfAborted();
    const html = verified.handback.files[0].content;
    const renders = await renderSourceStudyHtml(html, verified.handback.workState);
    combined.throwIfAborted();
    return { id: packet.id, roleResult, html, renders };
  });
  const completed = await Promise.all(pending).catch(async error => {
    abort.abort(error);
    await Promise.allSettled(pending);
    throw error;
  });
  const release = acquireProjectMutationLock(root, invocation);
  try {
    combined.throwIfAborted();
    if (sourceStudyPackets(root, invocation, prepared.input).contextSha256 !== prepared.contextSha256) {
      return fail('evidence-changed-during-study');
    }
    const writer = createProjectWriteAdapter(root, invocation);
    const variants = completed.map(study => {
      const htmlSha256 = sha256(study.html);
      const htmlPath = `${SOURCE_STUDY_BASE}/html/${htmlSha256}.html`;
      writer.writeContentAddressed(htmlPath, study.html);
      const renders = study.renders.map(render => {
        const digest = sha256(render.png);
        const path = `${SOURCE_STUDY_BASE}/renders/${digest}.png`;
        writer.writeContentAddressed(path, render.png);
        return { path, sha256: digest, viewport: render.viewport, state: render.state };
      });
      return { id: study.id, roleResult: study.roleResult,
        html: { path: htmlPath, sha256: htmlSha256 }, renders };
    });
    const payload = { schema: SOURCE_STUDY_SET_SCHEMA, contextSha256: prepared.contextSha256,
      input: prepared.input, variants };
    const record = { ...payload, signature: signNativeObservation(root, SOURCE_STUDY_SET_SCHEMA,
      sha256(canonicalJson(payload))) };
    const bytes = Buffer.from(canonicalJson(record));
    const digest = sha256(bytes);
    writer.writeContentAddressed(`${SOURCE_STUDY_BASE}/sets/${digest}.json`, bytes);
    writer.write(SOURCE_STUDY_LATEST, canonicalJson({ schema: SOURCE_STUDY_SET_SCHEMA, sha256: digest }));
    return { schema: SOURCE_STUDY_SET_SCHEMA, provisional: true as const, sha256: digest,
      variants: variants.map(({ id, html, renders, roleResult }) => ({
        id, html, renders, relationship: roleResult.handback.relationship,
        unresolvedConstraints: roleResult.handback.unresolvedConstraints,
      })) };
  } finally {
    release();
  }
}

export function selectSourceStudy(
  root: string, invocation: ProjectRunInvocation,
  selection: Readonly<{ setSha256: string; variantId: string; reason: string }>,
) {
  if (!selection.reason.trim() || Buffer.byteLength(selection.reason) > 4000) return fail('selection-reason');
  const release = acquireProjectMutationLock(root, invocation);
  try {
    const set = readSourceStudySet(root, invocation, selection.setSha256);
    if (!set.variants.some(variant => variant.id === selection.variantId)) return fail('selected-variant');
    const payload = { schema: SOURCE_STUDY_SELECTION_SCHEMA, ...selection };
    const bytes = Buffer.from(canonicalJson({ ...payload,
      signature: signNativeObservation(root, SOURCE_STUDY_SELECTION_SCHEMA, sha256(canonicalJson(payload))) }));
    const digest = sha256(bytes);
    const writer = createProjectWriteAdapter(root, invocation);
    writer.writeContentAddressed(`${SOURCE_STUDY_BASE}/selections/${digest}.json`, bytes);
    writer.write(SOURCE_STUDY_CURRENT, canonicalJson({ schema: SOURCE_STUDY_SELECTION_SCHEMA, sha256: digest }));
    return readSelectedSourceStudy(root, invocation);
  } finally {
    release();
  }
}

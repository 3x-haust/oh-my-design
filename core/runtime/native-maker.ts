import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { runPiMaker, requirePiMakerResult, type PiMakerResult } from '../../adapters/pi-maker-runtime.ts';
import { makerFail, parseMakerHandback } from '../../adapters/pi-maker-contract.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { CANDIDATE_EVIDENCE_FILES } from '../brief/candidate-selection.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter, replaceProjectFileAtomically, validateProjectWritePath } from './project-write.ts';
import { prepareNativeMaker, requirePreparedMaker, type NativeMakerContext, type PreparedNativeMaker } from './native-maker-packet.ts';

const consumed = new WeakSet<PiMakerResult>();
export function publishNativeMaker(context: NativeMakerContext & Readonly<{
  prepared: PreparedNativeMaker; result: PiMakerResult;
}>) {
  const { root, invocation, prepared, result } = context;
  requirePreparedMaker(prepared, root, invocation);
  requirePiMakerResult(result);
  if (consumed.has(result) || result.receipt.packetSha256 !== sha256(prepared.packet)
    || result.receipt.projectRoot !== root || result.receipt.role !== prepared.input.role) makerFail('result-binding-or-replay');
  const release = acquireProjectMutationLock(root, invocation);
  try {
    const fresh = prepareNativeMaker(context);
    if (!fresh.packet.equals(prepared.packet)) makerFail('stale-route-or-source-baseline');
    const handback = parseMakerHandback(result.handback, {
      bindings: prepared.bindings, paths: prepared.input.paths, referenceImages: prepared.referenceImages,
    });
    for (const file of handback.files) {
      const target = validateProjectWritePath(root, file.path);
      const stat = lstatSync(target, { throwIfNoEntry: false });
      if (stat !== undefined && (!stat.isFile() || stat.isSymbolicLink())) {
        makerFail('source-target-not-regular');
      }
    }
    if (prepared.input.role === 'omd-sketch') {
      const directory = `.omd/.cache/sketches/${prepared.input.candidateId}`;
      for (const name of CANDIDATE_EVIDENCE_FILES) {
        const path = `${directory}/${name}`;
        const proposed = handback.files.find(file => file.path === path);
        const content = proposed?.content ?? (existsSync(join(root, path))
          ? readContainedRegularFile(root, path, 'required candidate source').toString('utf8') : '');
        if (!content.trim()) {
          makerFail(`candidate-file-required:${name}`);
        }
      }
    }
    consumed.add(result);
    const writer = createProjectWriteAdapter(root, invocation);
    // All scope/currentness/result checks precede the first source mutation.
    for (const file of handback.files) writer.write(file.path, file.content);
    const record = Buffer.from(canonicalJson(result));
    const receiptPath = `.omd/makers/executions/${sha256(record)}.json`;
    writer.writeContentAddressed(receiptPath, record);
    const owner = prepared.input.role === 'omd-hand' ? 'hand' : `sketch-${prepared.input.candidateId}`;
    replaceProjectFileAtomically({ projectRoot: root, invocation,
      relativePath: `.omd/makers/current/${owner}.json`,
      content: canonicalJson({ schema: 'native-maker-current-v1', receiptPath, sha256: sha256(record) }) });
    return { schema: 'native-maker-publication-v1' as const, paths: handback.files.map(file => file.path),
      receiptPath, receipt: result.receipt };
  } finally { release(); }
}

export async function makeNativeSource(context: NativeMakerContext) {
  const prepared = prepareNativeMaker(context);
  const result = await runPiMaker({ root: context.root, invocation: context.invocation, prepared,
    ...(context.signal === undefined ? {} : { signal: context.signal }) });
  context.signal?.throwIfAborted();
  return publishNativeMaker({ ...context, prepared, result });
}

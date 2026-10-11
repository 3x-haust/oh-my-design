import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { checkBriefEntry } from '../brief/entry.ts';
import { CANDIDATE_EVIDENCE_FILES } from '../brief/candidate-selection.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute, pathsOutsideScope } from '../route/index.ts';
import { MAKER_HANDBACK, MAKER_TRANSPORT, makerFail, parseMakerInput,
  type MakerBindings, type MakerInput } from '../../adapters/pi-maker-contract.ts';
import { getNativePiRun } from './native-pi-run.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { validateProjectWritePath } from './project-write.ts';
import { makerContext, makerSourcePaths } from './native-maker-context.ts';
import { makerVisuals } from './native-maker-visuals.ts';

export type PreparedNativeMaker = Readonly<{
  packet: Buffer;
  input: MakerInput;
  bindings: MakerBindings;
  imageCount: number;
  referenceImages: readonly string[];
}>;
export type NativeMakerContext = Readonly<{
  root: string; invocation: ProjectRunInvocation; packRoot: string; input: unknown; signal?: AbortSignal;
}>;
const preparations = new WeakMap<PreparedNativeMaker, Readonly<{
  root: string; invocation: ProjectRunInvocation; packetSha256: string;
}>>();

export function requirePreparedMaker(prepared: PreparedNativeMaker, root: string, invocation: ProjectRunInvocation) {
  const current = preparations.get(prepared);
  if (current === undefined || current.root !== root || current.invocation !== invocation
    || current.packetSha256 !== sha256(prepared.packet)) return makerFail('host-prepared-packet-required');
  getNativePiRun(invocation, root);
  return prepared;
}

export function prepareNativeMaker(context: NativeMakerContext): PreparedNativeMaker {
  const { root, invocation, packRoot } = context;
  getNativePiRun(invocation, root);
  const input = parseMakerInput(context.input);
  const route = readPersistedRoute(root, invocation);
  const stage = input.role === 'omd-sketch' ? 'candidate-generation' : 'production';
  const entry = checkBriefEntry(root, stage, packRoot, invocation);
  if (entry.blockers.length > 0) makerFail(`stage-entry:${entry.blockers.join('; ')}`);
  if (!route.strategy.roles.includes(input.role) || !route.strategy.stages.includes(stage)) makerFail('role-not-selected');
  if (input.role === 'omd-hand' && pathsOutsideScope(route, input.paths).length > 0) makerFail('route-path-scope');
  for (const path of input.paths) {
    const target = validateProjectWritePath(root, path);
    const stat = lstatSync(target, { throwIfNoEntry: false });
    if (stat !== undefined && (!stat.isFile() || stat.isSymbolicLink())) makerFail('source-target-not-regular');
  }
  if (input.role === 'omd-sketch') {
    const missing = CANDIDATE_EVIDENCE_FILES.filter(name => {
      const path = `.omd/.cache/sketches/${input.candidateId}/${name}`;
      return !input.paths.includes(path)
        && (!existsSync(join(root, path)) || !readContainedRegularFile(root, path, 'retained candidate source').toString('utf8').trim());
    });
    if (missing.length > 0) makerFail(`candidate-file-required-in-grant:${missing.join(',')}`);
  }
  const projected = makerContext(root, route, { input, invocation });
  const sourcePaths = makerSourcePaths(root, input, route);
  const source = sourcePaths.filter(path => existsSync(join(root, path))).map(projected.source);
  if (source.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > 4 * 1024 * 1024) makerFail('source-byte-limit');
  const baseline = sourcePaths.map(path => ({ path,
    sha256: existsSync(join(root, path))
      ? sha256(readContainedRegularFile(root, path, 'maker source baseline')) : null }));
  const visual = makerVisuals({ root, invocation, route, maker: input });
  const evidence = {
    role: input.role, allowedPaths: input.paths,
    context: projected.context,
    documents: [...entry.contracts.map(contract => ({ path: contract.path,
      content: projected.project(readContainedRegularFile(packRoot, contract.path, 'maker role contract').toString('utf8')) })),
    ...projected.documents, ...visual.documents.map(document => ({
      path: document.path, content: projected.project(document.content),
    }))],
    source, renders: visual.renders,
    evaluatorLineage: projected.project(visual.lineage),
  };
  const bindings: MakerBindings = Object.freeze({
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    routeSha256: adaptiveRouteRecordSha256(route),
    baselineSha256: sha256(canonicalJson({ baseline, contracts: projected.digests,
      contextSha256: projected.contextSha256, visual })),
    evidenceSha256: sha256(canonicalJson(evidence)), role: input.role,
    firstRenderReviewSha256: visual.firstRenderReviewSha256,
    candidateSelectionSha256: visual.candidateSelectionSha256,
    compositionSha256: projected.digests.find(item => item.path === '.omd/composition.md')?.sha256 ?? null,
  });
  const packet = Buffer.from(canonicalJson({
    schema: MAKER_TRANSPORT, evidenceSha256: bindings.evidenceSha256, evidence,
    outputContract: { schema: MAKER_HANDBACK, fixedBindings: bindings,
      responseTemplate: { schema: MAKER_HANDBACK, fixedBindings: bindings,
        files: input.paths.map(path => ({ path, content: null })) } },
  }));
  const referenceImages = Object.freeze(visual.renders
    .filter(render => render.role === 'selected-reference-original').map(render => render.pngBase64));
  const prepared = Object.freeze({ packet, input, bindings, imageCount: visual.renders.length, referenceImages });
  preparations.set(prepared, { root, invocation, packetSha256: sha256(packet) });
  return prepared;
}

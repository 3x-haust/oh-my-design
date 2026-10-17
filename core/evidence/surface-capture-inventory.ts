import { existsSync } from 'node:fs';
import { directionCommitmentBlocker } from '../brief/candidate-choice.ts';
import {
  checkAllSurfaceContentProofs,
  parseSurfaceMappings,
  type SurfaceCapture,
} from '../brief/surface-coverage.ts';
import * as v from '../brief/candidate-data.ts';
import { checkExpansionContract } from '../brief/expansion.ts';
import { readFrame } from '../frame/index.ts';
import { requiredSurfaceCells } from '../frame/process-plan.ts';
import { loadMeasurement } from '../measure/files.ts';
import { currentSelectedSystem } from '../measure/selected-system.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import {
  acquireProjectMutationLock,
  replaceProjectFileAtomically,
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from '../runtime/project-write.ts';
import { validateTokenCommit } from '../tokens/contract.ts';
import { assertRepresentativeTokenAssignments } from '../tokens/resolve.ts';
import { readSelectedArtDirection } from '../art-direction/selected.ts';

export const SURFACE_CAPTURE_INPUT_PATH = '.omd/surface-captures.json';
export const SURFACE_CAPTURE_AUTHORING_PATH = '.omd/.cache/surface-captures-input.json';
const cellKey = (cell: { surfaceId: string; stateId: string; viewId: string }) =>
  JSON.stringify([cell.surfaceId, cell.stateId, cell.viewId]);

export function validateSurfaceCaptureInventory(root: string, value: unknown, invocation: ProjectRunInvocation) {
  const route = readPersistedRoute(root, invocation);
  if (!route.sourceContract.processPolicy) v.fail('current native process route required');
  const blocked = directionCommitmentBlocker(root);
  if (blocked) v.fail(blocked);
  const frame = readFrame(root);
  if (!frame?.surfacePlan) v.fail('current selected Frame requires native surface coverage');
  const plan = frame.surfacePlan;
  const system = currentSelectedSystem(root);
  if (route.strategy.methods.includes('concept-exploration') && !system) {
    v.fail('current process requires its authenticated selected direction');
  }
  const art = route.strategy.stages.includes('art-direction')
    ? readSelectedArtDirection(root, route.sourceContractSha256)
    : null;
  const artPointer = art
    ? v.object(JSON.parse(v.readBytes(root, '.omd/art-direction.json').toString('utf8')))
    : null;
  const directionSha256 = art ? v.receipt(artPointer!.record).sha256 : route.sourceContractSha256;
  const seed = existsSync(`${root}/.omd/tokens.json`)
    ? validateTokenCommit(JSON.parse(v.readBytes(root, '.omd/tokens.json').toString('utf8')))
    : null;
  const effective = system?.tokens.effective ?? seed;
  const effectiveTokensSha256 = system?.tokens.effectiveTokensSha256
    ?? (seed ? v.digest(seed) : route.sourceContractSha256);
  const roles = effective?.schema === 'token-commit-v3'
    ? [
        ...Object.keys(effective.semantic),
        ...Object.keys(effective.textStyles),
        ...Object.keys(effective.semantic).map(key => `semantic.${key}`),
        ...Object.keys(effective.textStyles).map(key => `textStyles.${key}`),
      ]
    : [];
  const hasComposition = route.strategy.stages.includes('composition')
    && existsSync(`${root}/.omd/composition.md`);
  const composition = hasComposition ? v.fileReceipt(root, '.omd/composition.md') : null;
  if (!composition && !route.strategy.skips.some(skip => skip.id === 'composition')) {
    v.fail('surface mapping has no composition owner or authorized applicability skip');
  }
  const input = v.object(value, [
    'schema',
    'captures',
    'contentProofs',
    ...(composition ? [] : ['mappings']),
  ]);
  v.enumeration(input.schema, ['surface-capture-inventory-v1']);
  const mappings = composition
    ? checkExpansionContract(v.readReceipt(root, composition).toString('utf8'), plan, roles).cells
    : parseSurfaceMappings(input.mappings);
  v.unique(mappings, cellKey);
  if (v.digest(mappings.map(cellKey).sort()) !== v.digest(requiredSurfaceCells(plan).map(cellKey).sort())) {
    v.fail('surface mappings must cover exactly the current Frame cells');
  }
  const captures: SurfaceCapture[] = v.list(input.captures, captureValue => {
    const capture = v.object(captureValue, ['surfaceId', 'stateId', 'viewId', 'packet', 'capture']);
    return {
      surfaceId: v.id(capture.surfaceId),
      stateId: v.id(capture.stateId),
      viewId: v.id(capture.viewId),
      packet: v.receipt(capture.packet),
      capture: v.receipt(capture.capture),
    };
  });
  v.unique(captures, cellKey);
  if (v.digest(captures.map(cellKey).sort()) !== v.digest(requiredSurfaceCells(plan).map(cellKey).sort())) {
    v.fail('surface captures must cover every required Frame cell exactly once');
  }
  const identities = new Set<string>();
  for (const row of captures) {
    const packet = loadMeasurement(root, row.packet);
    const mapping = mappings.find(candidate => cellKey(candidate) === cellKey(row))!;
    const captureViewId = Reflect.get(mapping, 'measurementViewId') ?? row.viewId;
    const view = packet.scope.find(scope => scope.id === captureViewId);
    const capture = packet.captures.find(candidate => candidate.viewId === captureViewId);
    const dimensions = plan.views.find(candidate => candidate.id === row.viewId)!;
    if (!view || !capture || view.route !== mapping.route || view.state !== mapping.state
      || view.stateRecipeSha256 !== mapping.stateRecipeSha256
      || view.viewport.width !== dimensions.width || view.viewport.height !== dimensions.height
      || v.digest(capture.capture) !== v.digest(row.capture)
      || packet.binding.routeSha256 !== adaptiveRouteRecordSha256(route)
      || packet.binding.sourceContractSha256 !== route.sourceContractSha256
      || packet.binding.activationBuildSha256 !== invocation.current.buildSha256
      || packet.summary.deterministicVerdict !== 'PASS') {
      v.fail('surface capture is not the actual current native mapped view/state');
    }
    v.readReceipt(root, row.capture);
    const identity = `${row.packet.sha256}:${view.id}`;
    if (identities.has(identity)) v.fail('one capture cannot stand in for another surface/state');
    identities.add(identity);
    const metrics = packet.measurements.filter(measurement => measurement.viewIds.includes(view.id));
    if (metrics.some(measurement => measurement.coverage.status !== 'complete')
      || packet.findings.some(finding => finding.severity === 'blocking' && finding.viewIds.includes(view.id))) {
      v.fail('surface measurement inventory is incomplete or RED');
    }
    if (system && row.surfaceId === system.representative.surfaceId
      && row.stateId === system.representative.stateId) {
      const raw = JSON.parse(v.readReceipt(root, capture.ir).toString('utf8')) as {
        measurement: {
          nodes: {
            contentId?: string | null;
            textStyleId?: string | null;
            text: string;
            visibleBox: unknown;
          }[];
        };
      };
      const observed: Record<string, string> = {};
      for (const node of raw.measurement.nodes.filter(node => node.text.trim() && node.contentId)) {
        if (observed[node.contentId!] !== undefined && observed[node.contentId!] !== node.textStyleId) {
          v.fail('representative token role is ambiguous');
        }
        observed[node.contentId!] = node.textStyleId ?? '';
      }
      assertRepresentativeTokenAssignments(system.assignments, observed);
    }
  }
  const contentProofs = v.list(input.contentProofs, v.receipt);
  if (plan.surfaces.some(surface => surface.contentCases.length) && !effective) {
    v.fail('content stress needs the actual current token system');
  }
  checkAllSurfaceContentProofs(
    root,
    plan,
    contentProofs.map(receipt => JSON.parse(v.readReceipt(root, receipt).toString('utf8'))),
    { selectedDirectionSha256: directionSha256, effectiveTokensSha256 },
  );
  return {
    schema: 'surface-capture-inventory-v1' as const,
    captures,
    contentProofs,
    ...(composition ? {} : { mappings }),
  };
}

export function publishSurfaceCaptureInventory(
  root: string,
  value: unknown,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
): v.Receipt {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const unlock = acquireProjectMutationLock(root, invocation);
  try {
    const inventory = validateSurfaceCaptureInventory(root, value, invocation);
    const bytes = v.jsonBytes(inventory);
    replaceProjectFileAtomically({
      projectRoot: root,
      relativePath: SURFACE_CAPTURE_INPUT_PATH,
      content: bytes,
      invocation,
    });
    return { path: SURFACE_CAPTURE_INPUT_PATH, sha256: v.hash(bytes) };
  } finally {
    unlock();
  }
}

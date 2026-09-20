import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReferenceBoard } from './board-parser.ts';
import { REFERENCE_BOARD_SCHEMA_VERSION, REFERENCE_BOARD_V2_SCHEMA_VERSION, REFERENCE_BOARD_V3_SCHEMA_VERSION, type ReferenceBoardManifest } from './board-contract.ts';
import { refIdentity } from './identity.ts';
import { referenceBoardProjectSha256, sha256 } from './board-artifacts.ts';
import { loadRefs } from './store.ts';
import { parseReferenceClassification, referenceClassificationSha256 } from './reference-classification.ts';
import { ACQUISITION_PLAN_V2_SCHEMA, validateAcquisitionPlan, type AcquisitionPlan, type AcquisitionPlanV2 } from '../deliberation/contracts.ts';
import { localeDesignContextJsonSha256 } from '../locale/design-context.ts';
import { sourceFeatureWitness } from './feature-measurement.ts';
import { readImageFragment } from './image-fragment.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const fail = (message: string): never => { throw new Error(`reference board input is invalid: ${message}`); };
const text = (value: unknown, path: string): string => typeof value === 'string' && value.trim() !== '' ? value : fail(`${path} must be a non-empty string`);
const list = (value: unknown, path: string): unknown[] => Array.isArray(value) ? value : fail(`${path} must be an array`);
const record = (value: unknown, path: string): Record<string, unknown> => isRecord(value) ? value : fail(`${path} must be an object`);
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[], path: string): void => {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) fail(`${path} has unknown keys: ${extras.join(', ')}`);
};

export function authorReferenceBoard(root: string, value: unknown): ReferenceBoardManifest {
  const rootInput = record(value, 'root');
  exactKeys(rootInput, ['candidates'], 'root');
  const candidates = list(rootInput.candidates, 'candidates');
  if (candidates.length < 2) fail('candidates must contain at least two independently assembled alternatives');

  const acquisitionBytes = readFileSync(join(root, '.omd', 'acquisition-plan.json'));
  const acquisitionResult = validateAcquisitionPlan(JSON.parse(acquisitionBytes.toString('utf8')));
  const acquisition = acquisitionResult.value ?? fail(`acquisition plan is invalid: ${acquisitionResult.findings.map((finding) => `${finding.id} ${finding.path}`).join(', ')}`);
  const acquisitionV2 = acquisition.schema === ACQUISITION_PLAN_V2_SCHEMA ? acquisition as AcquisitionPlanV2 : undefined;
  if (acquisitionV2?.localeContextSha256 !== null && acquisitionV2?.localeContextSha256 !== undefined) {
    const localeBytes = readFileSync(join(root, '.omd', 'locale-design-context.json'));
    if (localeDesignContextJsonSha256(localeBytes) !== acquisitionV2.localeContextSha256) fail('acquisition localeContextSha256 is stale');
  }
  const requiredZones = new Set(acquisition.zones
    .filter((zone) => zone.required === true)
    .map((zone, index) => text(zone.id, `acquisition.zones[${index}].id`)));
  if (requiredZones.size === 0) fail('acquisition plan must declare at least one required zone');

  const captured = loadRefs(root, { includeDomain: true });
  const references = new Map(captured.filter(reference => reference.researchLane !== 'domain')
    .map(reference => [refIdentity(reference.source, reference.component), reference]));
  const domainIds = new Set(captured.filter(reference => reference.researchLane === 'domain')
    .map(reference => refIdentity(reference.source, reference.component)));
  const authoredCandidates = candidates.map((candidateValue, candidateIndex) => {
    const candidate = record(candidateValue, `candidates[${candidateIndex}]`);
    exactKeys(candidate, ['id', 'label', 'route', 'rationale', 'pieces'], `candidates[${candidateIndex}]`);
    const pieces = list(candidate.pieces, `candidates[${candidateIndex}].pieces`).map((pieceValue, pieceIndex) => {
      const path = `candidates[${candidateIndex}].pieces[${pieceIndex}]`;
      const piece = record(pieceValue, path);
      const imageFragment = piece.sourceKind === 'image-fragment';
      const sourceKeys = imageFragment ? ['sourceKind', 'referenceId'] : ['source', 'component'];
      exactKeys(piece, [
        'slotId', ...sourceKeys, 'targetComponent', 'targetSelector', 'taskIds', 'reason', 'take',
        'avoid', 'adaptation', 'grid', 'rights', 'signal', 'motionAxis',
        ...(acquisitionV2 === undefined ? [] : ['binding']),
      ], path);
      const referenceId = imageFragment
        ? readImageFragment(root, text(piece.referenceId, `${path}.referenceId`)).id
        : refIdentity(text(piece.source, `${path}.source`), text(piece.component, `${path}.component`));
      if (!imageFragment && domainIds.has(referenceId)) {
        fail(`${path}.source is a domain reference; keep task/flow findings in domain research and application decisions. Choose a retained design capture with omd ref list --lane design --json; never relabel or recapture the domain service as design.`);
      }
      if (!imageFragment && !references.has(referenceId)) {
        fail(`${path}.source/component does not match a retained design capture (${referenceId}); use omd ref list --lane design --json and preserve its exact source and component.`);
      }
      const signal = text(piece.signal, `${path}.signal`);
      const nonvisual = signal === 'supporting-content' || signal === 'anti-reference';
      const common = {
        slotId: text(piece.slotId, `${path}.slotId`), referenceId,
        targetComponent: text(piece.targetComponent, `${path}.targetComponent`),
        targetSelector: text(piece.targetSelector, `${path}.targetSelector`),
        taskIds: piece.taskIds === undefined ? [`zone-${text(piece.slotId, `${path}.slotId`)}`] : list(piece.taskIds, `${path}.taskIds`),
        reason: text(piece.reason, `${path}.reason`), take: list(piece.take, `${path}.take`),
        avoid: text(piece.avoid, `${path}.avoid`), adaptation: text(piece.adaptation, `${path}.adaptation`), grid: piece.grid,
        evidenceAxes: {
          rights: text(piece.rights, `${path}.rights`), signal,
          staticAxis: nonvisual ? 'absent' as const : 'available' as const,
          motionAxis: text(piece.motionAxis, `${path}.motionAxis`),
        },
        ...(acquisitionV2 === undefined ? {} : { binding: piece.binding }),
      };
      if (imageFragment) {
        if (nonvisual) fail(`${path} nonvisual evidence requires a classified reference`);
        return { ...common, sourceKind: 'image-fragment' as const };
      }
      if (!nonvisual) return { ...common, sourceKind: 'component-capture' as const };
      const reference = references.get(referenceId) ?? fail(`${path} classified reference does not exist`);
      const classification = parseReferenceClassification(reference);
      const expected = signal === 'supporting-content' ? 'content-only' : 'anti-reference';
      if (classification.kind !== expected) fail(`${path} signal drifts from the persisted ${classification.kind} classification`);
      return {
        ...common, sourceKind: 'classified-reference' as const,
        classification: { kind: classification.kind, sha256: referenceClassificationSha256(classification) },
      };
    });
    const slots = pieces.map((piece) => piece.slotId);
    if (new Set(slots).size !== slots.length) fail(`candidates[${candidateIndex}] repeats a slot`);
    const coveredZones = acquisitionV2 === undefined
      ? slots
      : pieces.map((piece, pieceIndex) => {
        const binding = record(piece.binding, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding`);
        const zoneId = text(binding.zoneId, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding.zoneId`);
        const zone = acquisitionV2.zones.find((entry) => entry.id === zoneId) ?? fail(`candidates[${candidateIndex}].pieces[${pieceIndex}] binds unknown acquisition zone ${zoneId}`);
        const decisionId = text(binding.decisionId, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding.decisionId`);
        const axis = text(binding.axis, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding.axis`);
        const sourceState = text(binding.sourceState, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding.sourceState`);
        const viewport = record(binding.sourceViewport, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding.sourceViewport`);
        const width = viewport.width; const height = viewport.height;
        if (decisionId !== zone.decisionId) fail(`candidates[${candidateIndex}].pieces[${pieceIndex}] decisionId does not match acquisition zone ${zoneId}`);
        if (!zone.axes.includes(axis as never)) fail(`candidates[${candidateIndex}].pieces[${pieceIndex}] axis ${axis} was not requested for acquisition zone ${zoneId}`);
        if (sourceState !== zone.requiredState) fail(`candidates[${candidateIndex}].pieces[${pieceIndex}] sourceState does not match acquisition zone ${zoneId}`);
        if (!zone.viewports.some((entry) => entry.width === width && entry.height === height)) fail(`candidates[${candidateIndex}].pieces[${pieceIndex}] sourceViewport was not requested for acquisition zone ${zoneId}`);
        const targetViewports = list(binding.targetViewports, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding.targetViewports`).map((value, index) => {
          const target = record(value, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding.targetViewports[${index}]`);
          return `${String(target.width)}x${String(target.height)}`;
        }).sort();
        const requiredViewports = zone.viewports.map((entry) => `${entry.width}x${entry.height}`).sort();
        if (JSON.stringify(targetViewports) !== JSON.stringify(requiredViewports)) fail(`candidates[${candidateIndex}].pieces[${pieceIndex}] targetViewports must exactly preserve acquisition zone ${zoneId}`);
        if (text(binding.falsifier, `candidates[${candidateIndex}].pieces[${pieceIndex}].binding.falsifier`) !== zone.falsifier) fail(`candidates[${candidateIndex}].pieces[${pieceIndex}] falsifier does not match acquisition zone ${zoneId}`);
        const takes = list(piece.take, `candidates[${candidateIndex}].pieces[${pieceIndex}].take`);
        if (!takes.includes(axis)) fail(`candidates[${candidateIndex}].pieces[${pieceIndex}] take must include its primary axis ${axis}`);
        return zoneId;
      });
    const missing = [...requiredZones].filter((zone) => !coveredZones.includes(zone));
    if (missing.length > 0) fail(`candidates[${candidateIndex}] does not cover required zones: ${missing.join(', ')}`);
    return {
      id: text(candidate.id, `candidates[${candidateIndex}].id`),
      label: text(candidate.label, `candidates[${candidateIndex}].label`),
      route: text(candidate.route, `candidates[${candidateIndex}].route`),
      rationale: text(candidate.rationale, `candidates[${candidateIndex}].rationale`), pieces,
    };
  });
  const version = acquisitionV2 !== undefined
    ? REFERENCE_BOARD_V3_SCHEMA_VERSION
    : authoredCandidates.some((candidate) => candidate.pieces.some((piece) => piece.sourceKind === 'classified-reference'))
      ? REFERENCE_BOARD_V2_SCHEMA_VERSION : REFERENCE_BOARD_SCHEMA_VERSION;
  const parsed = parseReferenceBoard({
    schemaVersion: version,
    ...(version !== REFERENCE_BOARD_SCHEMA_VERSION ? { projectSha256: referenceBoardProjectSha256(root) } : {}),
    ...(version === REFERENCE_BOARD_V3_SCHEMA_VERSION ? { acquisitionSha256: sha256(acquisitionBytes), localeContextSha256: acquisitionV2!.localeContextSha256 } : {}),
    frameSha256: sha256(readFileSync(join(root, '.omd', 'frame.md'))),
    candidates: authoredCandidates,
  });
  for (const candidate of parsed.candidates) for (const piece of candidate.pieces) {
    if (piece.binding?.measurements) {
      const reference = references.get(piece.referenceId) ?? fail(`declared feature source ${piece.referenceId} does not exist`);
      for (const measurement of piece.binding.measurements) sourceFeatureWitness(reference.blueprint, measurement);
    }
  }
  return parsed;
}

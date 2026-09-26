import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateArtDirectionPointer,
} from '../core/art-direction/schema.ts';
import {
  type SourceBoundProofPath,
  validateSourceBoundProofCurrentness,
} from '../core/composition-contract/source-currentness.ts';
import {
  productionRepairReviewBytes,
} from '../core/runtime/production-repair.ts';
import {
  aggregateDesignQualityContracts,
  assertDesignQualityGreen,
} from '../core/evidence/final-v2-design-quality.ts';
import { loadDesignQualityObservationBindings } from '../core/evidence/final-v2-browser-observations.ts';
import {
  FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA,
  FINAL_RENDER_REVIEWER_TASK,
  FINAL_RENDER_REVIEWER_TRANSPORT_SCHEMA,
  finalRenderReviewerPacket,
} from '../core/runtime/final-render-review.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { nodeStableProjectFileSystem } from '../core/runtime/stable-project-file.ts';
import type { CodexRoleAuthorityReceipt } from '../core/runtime/role-receipt.ts';
import { PI_ROLE_RESULT_SCHEMA, verifySignedPiEyeRoleResult, type PiRoleAuthorityReceipt } from '../core/runtime/pi-role-receipt.ts';
import { getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { nativeFinalLanePacket, nativeFinalLaneTask } from '../core/runtime/native-final-packet.ts';
const SHA256 = /^[a-f0-9]{64}$/;
const LANE_CONTRACTS = {
  'blind-review-v2': {
    lane: 'blindLane',
    verdicts: ['blindVisual', 'blindNarrative'],
    floors: ['composition', 'copy'],
    requiresDesignQuality: true,
    handbackSchema: 'adaptive-final-render-reviewer-handback-v1',
    executionSchema: 'final-reviewer-execution-v2',
  },
  'adaptive-blind-review-v2': {
    lane: 'blindLane',
    verdicts: ['blindVisual', 'blindNarrative', 'interactionBenchmarkFit', 'domainSpecificity', 'realityFit'],
    floors: ['composition', 'copy', 'interactionQuality'],
    requiresDesignQuality: true,
    handbackSchema: 'adaptive-final-reviewer-handback-v2',
    executionSchema: 'adaptive-final-reviewer-execution-v2',
  },
  'adaptive-blind-review-v3': {
    lane: 'blindLane',
    verdicts: ['blindVisual', 'blindNarrative', 'interactionBenchmarkFit', 'domainSpecificity', 'realityFit'],
    floors: ['composition', 'copy', 'interactionQuality'],
    requiresDesignQuality: true,
    handbackSchema: 'adaptive-final-reviewer-handback-v2',
    executionSchema: 'adaptive-final-reviewer-execution-v2',
  },
  'adaptive-fidelity-review-v1': {
    lane: 'fidelityLane',
    verdicts: ['referenceFidelity', 'renderFidelity'],
    floors: ['desktop', 'mobile'],
    requiresDesignQuality: false,
    handbackSchema: 'adaptive-final-reviewer-handback-v1',
    executionSchema: 'adaptive-final-reviewer-execution-v1',
  },
  'adaptive-protocol-review-v1': {
    lane: 'protocolLane',
    verdicts: ['evidenceIntegrity', 'publicationProtocol'],
    floors: ['authority', 'currentness'],
    requiresDesignQuality: false,
    handbackSchema: 'adaptive-final-reviewer-handback-v1',
    executionSchema: 'adaptive-final-reviewer-execution-v1',
  },
  'fidelity-review-v1': {
    lane: 'fidelityLane', verdicts: ['referenceFidelity', 'renderFidelity'],
    floors: ['desktop', 'mobile'], requiresDesignQuality: false,
    handbackSchema: 'adaptive-final-reviewer-handback-v1', executionSchema: 'final-reviewer-execution-v1',
  },
  'protocol-review-v1': {
    lane: 'protocolLane', verdicts: ['evidenceIntegrity', 'publicationProtocol'],
    floors: ['authority', 'currentness'], requiresDesignQuality: false,
    handbackSchema: 'adaptive-final-reviewer-handback-v1', executionSchema: 'final-reviewer-execution-v1',
  },
} as const;

type Artifact = Readonly<{ path: string; sha256: string; bytes: Buffer }>;

export type FinalReviewerPublication = Readonly<{
  lane: Artifact;
  executions: readonly Artifact[];
}>;

export class FinalReviewPublicationError extends Error {
  override readonly name = 'FinalReviewPublicationError';
}

function fail(message: string): never {
  throw new FinalReviewPublicationError(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  }
  const item: Record<string, unknown> = {};
  for (const key of Object.keys(value)) item[key] = Reflect.get(value, key);
  return item;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fail('FINAL_REVIEW_PUBLICATION_INVALID:non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const item = record(value, 'non-JSON value');
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`;
}

const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  return value;
}

function stringList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) return fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  const items = value.map((item, index) => digest(item, `${label}[${index}]`));
  if (new Set(items).size !== items.length) return fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  return items;
}

function findingList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) return fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  const items = value.map((item, index) => text(item, `${label}[${index}]`));
  if (new Set(items).size !== items.length) return fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  return items;
}

function keyList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== 'string' || item.trim() === '')
    || new Set(value).size !== value.length) {
    return fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}`);
  }
  return Object.freeze([...value]) as readonly string[];
}

function currentArtDirectionSha256(projectRoot: string): string {
  try {
    const pointer = validateArtDirectionPointer(JSON.parse(
      readFileSync(join(projectRoot, '.omd', 'art-direction.json'), 'utf8'),
    ) as unknown);
    readFileSync(join(projectRoot, '.omd', pointer.record));
    return pointer.sha256;
  } catch {
    return fail('FINAL_REVIEW_PUBLICATION_INVALID:art direction binding');
  }
}

export function verifySignedEyeRoleResult(value: unknown, projectRoot: string, publicKeyPath?: string): Readonly<{
  receipt: CodexRoleAuthorityReceipt | PiRoleAuthorityReceipt;
  finalMessage: string;
}> {
  const result = record(value, 'role result');
  if (result.schema === PI_ROLE_RESULT_SCHEMA) return verifySignedPiEyeRoleResult(value, projectRoot);
  if (publicKeyPath === undefined) return fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED');
  const authority = record(result.authority, 'role authority');
  const receipt = record(authority.receipt, 'role receipt');
  const signature = text(authority.signature, 'role signature');
  const publicKey = createPublicKey(readFileSync(realpathSync(publicKeyPath)));
  const legacySelection = receipt.modelArgumentOmitted === undefined
    && receipt.model === undefined
    && receipt.modelReasoningEffort === undefined;
  const reviewerEvidence = receipt.reviewerEvidence === undefined
    ? undefined
    : record(receipt.reviewerEvidence, 'role reviewer evidence');
  if (!verify(null, Buffer.from(canonicalJson(receipt)), publicKey, Buffer.from(signature, 'base64'))) {
    return fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED');
  }
  if (result.schema !== 'omd-codex-role-result-v1' || result.agent !== 'omd-eye'
    || result.projectRoot !== projectRoot || result.result !== 'completed'
    || typeof result.finalMessage !== 'string' || result.finalMessage !== receipt.finalMessage
    || receipt.schema !== 'omd-codex-role-exec-result-v1' || receipt.role !== 'omd-eye'
    || receipt.projectRoot !== projectRoot || receipt.status !== 'completed'
    || !Number.isSafeInteger(receipt.processPid) || Number(receipt.processPid) <= 0
    || typeof receipt.sessionId !== 'string' || receipt.sessionId === ''
    || typeof receipt.roleNonce !== 'string' || receipt.roleNonce === ''
    || (!legacySelection && (typeof receipt.modelArgumentOmitted !== 'boolean'
      || (receipt.modelArgumentOmitted ? receipt.model !== undefined : typeof receipt.model !== 'string' || receipt.model.trim() === '')
      || typeof receipt.modelReasoningEffort !== 'string' || !/^(?:low|medium|high|xhigh)$/.test(receipt.modelReasoningEffort)))
    || !SHA256.test(String(receipt.configurationSha256))
    || !SHA256.test(String(receipt.buildSha256)) || !SHA256.test(String(receipt.briefSha256))) {
    return fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED');
  }
  const typed: CodexRoleAuthorityReceipt = {
    schema: 'omd-codex-role-exec-result-v1',
    role: 'omd-eye',
    projectRoot,
    status: 'completed',
    exitCode: receipt.exitCode === null ? null : Number(receipt.exitCode),
    signal: receipt.signal === null ? null : text(receipt.signal, 'role signal'),
    eventCount: Number(receipt.eventCount),
    finalMessage: receipt.finalMessage,
    processPid: Number(receipt.processPid),
    roleNonce: text(receipt.roleNonce, 'role nonce'),
    ...(receipt.taskSha256 === undefined ? {} : { taskSha256: digest(receipt.taskSha256, 'role task') }),
    ...(reviewerEvidence === undefined ? {} : {
      reviewerEvidence: Object.freeze({
        schema: reviewerEvidence.schema === 'omd-reviewer-evidence-consumption-v1'
          ? reviewerEvidence.schema : fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED'),
        evidenceSha256: digest(reviewerEvidence.evidenceSha256, 'role reviewer evidence'),
        packetSha256: digest(reviewerEvidence.packetSha256, 'role reviewer packet'),
        taskSha256: digest(reviewerEvidence.taskSha256, 'role reviewer task'),
        childPid: Number.isSafeInteger(reviewerEvidence.childPid) && Number(reviewerEvidence.childPid) > 0
          ? Number(reviewerEvidence.childPid) : fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED'),
        sessionId: text(reviewerEvidence.sessionId, 'role reviewer session'),
        nonce: text(reviewerEvidence.nonce, 'role reviewer nonce'),
      }),
    }),
    ...(legacySelection ? {} : {
      modelArgumentOmitted: receipt.modelArgumentOmitted as boolean,
      ...(typeof receipt.model === 'string' ? { model: receipt.model } : {}),
      modelReasoningEffort: receipt.modelReasoningEffort as string,
    }),
    configurationSha256: digest(receipt.configurationSha256, 'role configuration'),
    buildSha256: digest(receipt.buildSha256, 'role build'),
    briefSha256: digest(receipt.briefSha256, 'role brief'),
    sessionId: receipt.sessionId,
    ...(receipt.failure === undefined ? {} : { failure: text(receipt.failure, 'role failure') }),
  };
  return Object.freeze({ receipt: Object.freeze(typed), finalMessage: result.finalMessage });
}

function greenRecord(value: unknown, keys: readonly string[], floor: boolean, label: string): Record<string, unknown> {
  const item = record(value, label);
  exact(item, keys, label);
  for (const key of keys) {
    const observed = item[key];
    if (floor ? typeof observed !== 'number' || !Number.isFinite(observed) || observed < 3 : observed !== 'GREEN') {
      fail(`FINAL_REVIEW_PUBLICATION_INVALID:${label}.${key}`);
    }
  }
  return item;
}

export function buildFinalReviewerPublication(
  input: unknown,
  context: Readonly<{
    projectRoot: string;
    buildSha256: string;
    briefSha256: string;
    publicKeyPath?: string;
    invocation: ProjectRunInvocation;
  }>,
): FinalReviewerPublication {
  const proofPaths = ['.omd/type-proof.md', '.omd/composition.md']
    .filter((path) => existsSync(join(context.projectRoot, path))) as SourceBoundProofPath[];
  if (proofPaths.length > 0) {
    const findings = validateSourceBoundProofCurrentness(context.projectRoot, proofPaths);
    if (findings.length > 0) fail(`SOURCE_BOUND_PROOF_CURRENTNESS_RED:${JSON.stringify(findings)}`);
  }
  const publication = record(input, 'publication');
  exact(publication, ['schema', 'laneSchema', 'roleResults'], 'publication');
  if (publication.schema !== 'adaptive-final-review-publication-v1') {
    return fail('FINAL_REVIEW_PUBLICATION_INVALID:schema');
  }
  const laneSchema = text(publication.laneSchema, 'laneSchema');
  const contract = laneSchema === 'blind-review-v2'
    ? LANE_CONTRACTS[laneSchema]
    : laneSchema === 'adaptive-blind-review-v3'
    ? LANE_CONTRACTS[laneSchema]
    : laneSchema === 'adaptive-blind-review-v2'
    ? LANE_CONTRACTS[laneSchema]
    : laneSchema === 'adaptive-fidelity-review-v1'
      ? LANE_CONTRACTS[laneSchema]
      : laneSchema === 'adaptive-protocol-review-v1'
        ? LANE_CONTRACTS[laneSchema]
        : laneSchema === 'fidelity-review-v1' || laneSchema === 'protocol-review-v1'
          ? LANE_CONTRACTS[laneSchema]
        : undefined;
  if (contract === undefined) return fail('FINAL_REVIEW_PUBLICATION_INVALID:laneSchema');
  const artDirectionBinding = laneSchema === 'blind-review-v2'
    || laneSchema === 'fidelity-review-v1' || laneSchema === 'protocol-review-v1'
    ? currentArtDirectionSha256(context.projectRoot)
    : undefined;
  if (!Array.isArray(publication.roleResults) || publication.roleResults.length !== 2) {
    return fail('FINAL_REVIEW_PUBLICATION_INVALID:roleResults');
  }
  const roles = publication.roleResults.map((value) =>
    verifySignedEyeRoleResult(value, context.projectRoot, context.publicKeyPath));
  const piRoles = roles.filter(({ receipt }) => receipt.schema === 'omd-pi-role-exec-result-v1');
  if (roles.some(({ receipt }) => receipt.buildSha256 !== context.buildSha256
    || receipt.briefSha256 !== context.briefSha256)) fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED:stale run');
  if (piRoles.length > 0) {
    if (piRoles.length !== roles.length) fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED:mixed hosts');
    const run = getNativePiRun(context.invocation, context.projectRoot);
    for (const { receipt } of piRoles) {
      if (receipt.schema !== 'omd-pi-role-exec-result-v1'
        || receipt.provider !== run.host.provider
        || receipt.model !== run.host.model || receipt.nodeSha256 !== run.host.nodeSha256
        || receipt.cliSha256 !== run.host.cliSha256) fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED:Pi host identity');
    }
  }
  const identities = roles.map((role) => ({
    processPid: role.receipt.processPid,
    sessionId: role.receipt.sessionId,
    nonce: role.receipt.roleNonce,
    configurationSha256: role.receipt.configurationSha256,
  }));
  const evidenceProofs = roles.map((role, index) => {
    const proof = role.receipt.reviewerEvidence;
    if (!contract.requiresDesignQuality) return undefined;
    if (proof === undefined || role.receipt.taskSha256 === undefined
      || proof.taskSha256 !== role.receipt.taskSha256) {
      return fail(`FINAL_REVIEW_PUBLICATION_INVALID:roleResults[${index}] did not consume isolated reviewer evidence`);
    }
    return proof;
  });
  const expectedTaskSha256 = hash(FINAL_RENDER_REVIEWER_TASK);
  if (contract.requiresDesignQuality) {
    const proofs = evidenceProofs.filter((proof) => proof !== undefined);
    if (roles.some((role) => role.receipt.taskSha256 !== expectedTaskSha256)
      || proofs.some((proof) => proof.taskSha256 !== expectedTaskSha256)
      || proofs[0]?.packetSha256 !== proofs[1]?.packetSha256
      || new Set(identities.map(({ configurationSha256 }) => configurationSha256)).size !== 1
      || new Set(identities.map(({ processPid }) => processPid)).size !== 2
      || new Set(identities.map(({ sessionId }) => sessionId)).size !== 2
      || new Set(identities.map(({ nonce }) => nonce)).size !== 2
      || new Set(proofs.map(({ childPid }) => childPid)).size !== 2
      || new Set(proofs.map(({ sessionId }) => sessionId)).size !== 2
      || new Set(proofs.map(({ nonce }) => nonce)).size !== 2) {
      return fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED:reviewer task, configuration, packet, or identities');
    }
  } else if (new Set(identities.flatMap((identity) =>
    Object.values(identity).map(String))).size !== 8) {
    return fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED:reviewer identities are reused');
  }
  const handbacks = roles.map((role, index) => {
    let parsed: unknown;
    try { parsed = JSON.parse(role.finalMessage) as unknown; }
    catch { return fail(`FINAL_REVIEW_PUBLICATION_INVALID:handback[${index}]`); }
    const handback = record(parsed, `handback[${index}]`);
    const observationSha256s = Array.isArray(handback.observationSha256s)
      ? handback.observationSha256s.filter(
        (value): value is string => typeof value === 'string',
      )
      : [];
    const boundObservationSha256s = stringList(
      observationSha256s,
      `handback[${index}].observationSha256s`,
    );
    let verdictKeys: readonly string[] = contract.verdicts;
    let floorKeys: readonly string[] = contract.floors;
    let reviewerFields: readonly string[] = [
      'schema', 'lane', 'verdicts', 'criticalFloors', 'observationSha256s',
      'routeSha256', 'buildSha256', 'briefSha256', 'browserSha256',
      ...(artDirectionBinding === undefined ? [] : ['artDirectionSha256']),
      'evidenceSha256', ...(handback.findings === undefined ? [] : ['findings']),
    ];
    let fixed = record({
      observationSha256s: boundObservationSha256s,
      routeSha256: handback.routeSha256,
      buildSha256: handback.buildSha256,
      briefSha256: handback.briefSha256,
      browserSha256: handback.browserSha256,
      evidenceSha256: handback.evidenceSha256,
      ...(artDirectionBinding === undefined ? {} : { artDirectionSha256: artDirectionBinding }),
    }, `handback[${index}].fixedBindings`);
    if (role.receipt.schema === 'omd-pi-role-exec-result-v1' && !contract.requiresDesignQuality) {
      const currentPacket = nativeFinalLanePacket({ root: context.projectRoot, invocation: context.invocation,
        observationSha256s: boundObservationSha256s, lane: contract.lane });
      const proof = role.receipt.reviewerEvidence;
      const packet = record(JSON.parse(currentPacket.toString('utf8')), 'native lane packet');
      const output = record(packet.outputContract, 'native lane output');
      fixed = record(output.fixedBindings, 'native lane bindings');
      reviewerFields = keyList(output.reviewerFields, 'native lane reviewer fields');
      if (proof.packetSha256 !== hash(currentPacket) || proof.evidenceSha256 !== packet.evidenceSha256
        || role.receipt.taskSha256 !== hash(nativeFinalLaneTask(contract.lane))
        || output.laneSchema !== laneSchema) return fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED:native lane packet');
    }
    if (contract.requiresDesignQuality) {
      const currentPacket = finalRenderReviewerPacket({
        root: context.projectRoot,
        invocation: context.invocation,
        packetInput: {
          schema: 'adaptive-final-render-reviewer-packet-input-v1',
          observationSha256s: boundObservationSha256s,
        },
      });
      const proof = evidenceProofs[index];
      if (proof === undefined || hash(currentPacket) !== proof.packetSha256) {
        return fail(`FINAL_REVIEW_PUBLICATION_INVALID:handback[${index}] did not consume the current final packet`);
      }
      let packetValue: unknown;
      try { packetValue = JSON.parse(currentPacket.toString('utf8')) as unknown; }
      catch { return fail(`FINAL_REVIEW_PUBLICATION_INVALID:packet[${index}]`); }
      const packet = record(packetValue, `packet[${index}]`);
      exact(packet, ['schema', 'evidenceSha256', 'evidence', 'outputContract'], `packet[${index}]`);
      const output = record(packet.outputContract, `packet[${index}].outputContract`);
      exact(output, [
        'schema', 'lane', 'laneSchema', 'verdictKeys', 'criticalFloorKeys',
        'designQuality', 'reviewerFields', 'fixedBindings',
      ], `packet[${index}].outputContract`);
      fixed = record(output.fixedBindings, `packet[${index}].fixedBindings`);
      exact(fixed, [
        'observationSha256s', 'routeSha256', 'buildSha256', 'briefSha256',
        'browserSha256', 'evidenceSha256',
        ...(laneSchema === 'blind-review-v2' ? ['artDirectionSha256'] : []),
      ], `packet[${index}].fixedBindings`);
      verdictKeys = keyList(output.verdictKeys, `packet[${index}].verdictKeys`);
      floorKeys = keyList(output.criticalFloorKeys, `packet[${index}].criticalFloorKeys`);
      reviewerFields = keyList(output.reviewerFields, `packet[${index}].reviewerFields`);
      const expectedReviewerFields = [
        'schema', 'lane', 'verdicts', 'criticalFloors', 'designQuality',
        'observationSha256s', 'routeSha256',
        ...(laneSchema === 'blind-review-v2' ? ['artDirectionSha256'] : []),
        'buildSha256', 'briefSha256', 'browserSha256', 'evidenceSha256', 'findings',
      ];
      const allowedVerdicts = laneSchema === 'blind-review-v2'
        ? [...contract.verdicts, 'realityFit']
        : contract.verdicts;
      const orderedVerdicts = allowedVerdicts.filter((key) => verdictKeys.includes(key));
      const orderedFloors = contract.floors.filter((key) => floorKeys.includes(key));
      if (packet.schema !== FINAL_RENDER_REVIEWER_TRANSPORT_SCHEMA
        || output.schema !== FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA
        || output.lane !== contract.lane
        || output.laneSchema !== laneSchema
        || !verdictKeys.includes('blindVisual')
        || !verdictKeys.includes('blindNarrative')
        || canonicalJson(verdictKeys) !== canonicalJson(orderedVerdicts)
        || !floorKeys.includes('composition')
        || !floorKeys.includes('copy')
        || canonicalJson(floorKeys) !== canonicalJson(orderedFloors)
        || canonicalJson(reviewerFields) !== canonicalJson(expectedReviewerFields)
        || packet.evidenceSha256 !== proof.evidenceSha256
        || fixed.evidenceSha256 !== proof.evidenceSha256
        || (laneSchema === 'blind-review-v2'
          && fixed.artDirectionSha256 !== artDirectionBinding)) {
        return fail(`FINAL_REVIEW_PUBLICATION_INVALID:packet[${index}] contract`);
      }
    }
    exact(handback, reviewerFields, `handback[${index}]`);
    if (handback.schema !== (contract.requiresDesignQuality
      ? FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA : contract.handbackSchema)
      || handback.lane !== contract.lane
      || handback.buildSha256 !== context.buildSha256
      || handback.briefSha256 !== context.briefSha256
      || handback.routeSha256 !== fixed.routeSha256
      || handback.buildSha256 !== fixed.buildSha256
      || handback.briefSha256 !== fixed.briefSha256
      || handback.browserSha256 !== fixed.browserSha256
      || handback.evidenceSha256 !== fixed.evidenceSha256
      || (artDirectionBinding !== undefined
        && handback.artDirectionSha256 !== fixed.artDirectionSha256)
      || canonicalJson(boundObservationSha256s) !== canonicalJson(fixed.observationSha256s)) {
      return fail(`FINAL_REVIEW_PUBLICATION_INVALID:handback[${index}] binding`);
    }
    const designQuality = contract.requiresDesignQuality
      ? assertDesignQualityGreen(handback.designQuality, {
        expectedObservationSha256s: boundObservationSha256s,
        expectedObservationBindings: loadDesignQualityObservationBindings(
          context.projectRoot,
          nodeStableProjectFileSystem(),
          boundObservationSha256s,
        ),
      })
      : undefined;
    return Object.freeze({
      lane: contract.lane,
      verdicts: greenRecord(handback.verdicts, verdictKeys, false, `handback[${index}].verdicts`),
      criticalFloors: greenRecord(handback.criticalFloors, floorKeys, true, `handback[${index}].criticalFloors`),
      observationSha256s: boundObservationSha256s,
      routeSha256: digest(handback.routeSha256, `handback[${index}].routeSha256`),
      buildSha256: digest(handback.buildSha256, `handback[${index}].buildSha256`),
      briefSha256: digest(handback.briefSha256, `handback[${index}].briefSha256`),
      browserSha256: digest(handback.browserSha256, `handback[${index}].browserSha256`),
      evidenceSha256: digest(handback.evidenceSha256, `handback[${index}].evidenceSha256`),
      ...(designQuality === undefined ? {} : { designQuality }),
      findings: handback.findings === undefined ? Object.freeze([]) : Object.freeze(findingList(handback.findings, `handback[${index}].findings`)),
    });
  });
  const comparable = (value: typeof handbacks[number]): string => canonicalJson({
    lane: value.lane,
    observationSha256s: value.observationSha256s,
    routeSha256: value.routeSha256,
    buildSha256: value.buildSha256,
    briefSha256: value.briefSha256,
    browserSha256: value.browserSha256,
  });
  const firstHandback = handbacks[0];
  const secondHandback = handbacks[1];
  if (firstHandback === undefined || secondHandback === undefined) {
    return fail('FINAL_REVIEW_PUBLICATION_INVALID:roleResults');
  }
  if (comparable(firstHandback) !== comparable(secondHandback)) {
    return fail('FINAL_REVIEW_PUBLICATION_INVALID:reviewer handback bindings disagree');
  }
  const floorDimensions = Object.keys(firstHandback.criticalFloors);
  const aggregateFloors = Object.freeze(Object.fromEntries(
    floorDimensions.map((dimension) => [
      dimension,
      Math.min(...handbacks.map(({ criticalFloors }) => Number(criticalFloors[dimension]))),
    ]),
  ));
  const aggregateDesignQuality = contract.requiresDesignQuality
    ? aggregateDesignQualityContracts(handbacks.map(({ designQuality }) =>
      designQuality ?? fail('FINAL_REVIEW_PUBLICATION_INVALID:designQuality')))
    : undefined;
  const isolationSha256 = hash(canonicalJson(identities));
  const executions = roles.map((role, index) => {
    const handback = handbacks[index];
    if (handback === undefined || role.receipt.sessionId === undefined) {
      return fail('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED');
    }
    const value = {
      schema: contract.executionSchema,
      lane: handback.lane,
      reviewerId: `omd-eye-${hash(role.receipt.sessionId).slice(0, 16)}`,
      verdicts: handback.verdicts,
      criticalFloors: handback.criticalFloors,
      ...(handback.designQuality === undefined ? {} : {
        designQuality: handback.designQuality,
      }),
      findings: handback.findings,
      isolationReceiptSha256: isolationSha256,
      observationSha256s: handback.observationSha256s,
      ...(artDirectionBinding === undefined
        ? { routeSha256: handback.routeSha256 }
        : { artDirectionSha256: artDirectionBinding }),
      buildSha256: handback.buildSha256,
      briefSha256: handback.briefSha256,
      browserSha256: handback.browserSha256,
      childPid: role.receipt.processPid,
      sessionId: role.receipt.sessionId,
      nonce: role.receipt.roleNonce,
      evidenceSha256: handback.evidenceSha256,
      configurationSha256: role.receipt.configurationSha256,
    };
    const bytes = Buffer.from(`${canonicalJson(value)}\n`);
    const sha256 = hash(bytes);
    return Object.freeze({
      path: `.omd/final-review/executions/sha256-${sha256}.json`,
      sha256,
      bytes,
      reviewerId: value.reviewerId,
    });
  });
  const first = handbacks[0];
  if (first === undefined) return fail('FINAL_REVIEW_PUBLICATION_INVALID:roleResults');
  const laneValue = {
    schema: laneSchema,
    ...(artDirectionBinding === undefined
      ? { routeSha256: first.routeSha256 }
      : { artDirectionSha256: artDirectionBinding }),
    buildSha256: first.buildSha256,
    isolationReceipt: { schema: 'reviewer-isolation-v1', sha256: isolationSha256 },
    verdicts: first.verdicts,
    criticalFloors: aggregateFloors,
    ...(aggregateDesignQuality === undefined ? {} : {
      designQuality: aggregateDesignQuality,
    }),
    quorum: { required: 2, passed: 2 },
    provenance: {
      observationSha256s: first.observationSha256s,
      reviewerIds: executions.map((execution) => execution.reviewerId),
      reviewerSessionSha256: isolationSha256,
    },
    executionReceipts: executions.map((execution) => ({
      path: execution.path,
      sha256: execution.sha256,
    })),
  };
  const laneBytes = Buffer.from(`${canonicalJson(laneValue)}\n`);
  const laneSha256 = hash(laneBytes);
  return Object.freeze({
    lane: Object.freeze({
      path: `.omd/final-review/lanes/${contract.lane}-sha256-${laneSha256}.json`,
      sha256: laneSha256,
      bytes: laneBytes,
    }),
    executions: Object.freeze(executions.map(({ path, sha256, bytes }) =>
      Object.freeze({ path, sha256, bytes }))),
  });
}

export function buildProductionRepairReviewPublication(
  input: unknown,
  context: Readonly<{ projectRoot: string; publicKeyPath: string }>,
): Artifact {
  const publication = record(input, 'repair publication');
  exact(publication, ['schema', 'roleResult'], 'repair publication');
  if (publication.schema !== 'production-repair-review-publication-v1') {
    return fail('FINAL_REVIEW_PUBLICATION_INVALID:repair schema');
  }
  const role = verifySignedEyeRoleResult(
    publication.roleResult,
    context.projectRoot,
    context.publicKeyPath,
  );
  let parsed: unknown;
  try { parsed = JSON.parse(role.finalMessage) as unknown; }
  catch { return fail('FINAL_REVIEW_PUBLICATION_INVALID:repair handback'); }
  let bytes: Buffer;
  try { bytes = productionRepairReviewBytes(parsed); }
  catch { return fail('FINAL_REVIEW_PUBLICATION_INVALID:repair handback'); }
  const sha256 = hash(bytes);
  return Object.freeze({
    path: `.omd/final-review/repairs/sha256-${sha256}.json`,
    sha256,
    bytes,
  });
}

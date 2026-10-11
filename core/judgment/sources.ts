import { readCurrentObservationV2, observationV2Sha256 } from '../runtime/observation.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { currentReferenceEvidenceAfter, readCurrentDirectDiscoveryEntry, readCurrentDiscoveryNavigation, publicDiscoveryUrl } from '../ref/discovery-record.ts';
import { readSearchExecution } from '../ref/search-execution.ts';
import { readLiveReferenceFlow } from '../ref/live-flow.ts';
import { artifactDigest } from '../runtime/artifact-digest.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPiRequest } from '../../extensions/omd-request-source.ts';
import { JudgmentError, judgmentSha256, type SourceRef, type TrustedJudgmentSource, type JudgmentVerificationContext } from './index.ts';

const SIGNED_REFERENCE_SCHEMAS = new Set([
  'reference-search-execution-v3', 'reference-search-execution-v4',
  'reference-navigation-capture-v6', 'reference-navigation-capture-v7',
  'reference-discovery-entry-v5', 'reference-discovery-entry-v6',
  'reference-flow-execution-v1', 'reference-control-observation-v1',
]);
function signedReferenceSource(root: string, current: Omit<JudgmentVerificationContext, 'resolve'>,
  ref: Extract<SourceRef, { kind: 'receipt' }>, field: string, itemId: string | null): TrustedJudgmentSource {
  const pathBySchema = ref.schema === 'reference-control-observation-v1'
    ? `.omd/discovery/domain/controls/sha256-${ref.sha256}.json`
    : ref.schema === 'reference-flow-execution-v1'
      ? `.omd/refs/domain/flows/executions/${ref.sha256}.json` : null;
  if (!SIGNED_REFERENCE_SCHEMAS.has(ref.schema)
    || (pathBySchema === null ? !/^\.omd\/discovery\/(?:domain|design)\/(?:search-[a-f0-9]{64}|(?:navigation|entries)\/[a-f0-9]{64})\.json$/u.test(ref.path)
      : ref.path !== pathBySchema)
    || !/^\/.+/u.test(field) || field.includes('__proto__')) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  const bytes = readContainedRegularFile(root, ref.path, ref.path);
  if (judgmentSha256(bytes) !== ref.sha256) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  const raw: unknown = JSON.parse(bytes.toString('utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  const { signature, ...body } = raw as Record<string, unknown>;
  const signatureKind = ref.schema === 'reference-flow-execution-v1' ? 'reference-flow-v1' : ref.schema;
  if (body.schema !== ref.schema || typeof signature !== 'string'
    || !verifyNativeObservation(root, signatureKind, judgmentSha256(canonicalJson(body)), signature))
    throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  const timestamp = body.observedAt ?? body.capturedAt ?? body.completedAt;
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))
    || Date.parse(timestamp) < currentReferenceEvidenceAfter(root) || Date.parse(timestamp) > Date.now() + 300_000)
    throw new JudgmentError('AI_JUDGMENT_SOURCE_STALE');
  if (ref.schema.startsWith('reference-search-execution-')) {
    const lane = ref.path.startsWith('.omd/discovery/domain/') ? 'domain' : 'design';
    readSearchExecution(root, { path: ref.path, sha256: ref.sha256 }, lane);
  } else if (ref.schema.startsWith('reference-navigation-capture-') || ref.schema.startsWith('reference-discovery-entry-')) {
    const acquisition = body.acquisition;
    if (!acquisition || typeof acquisition !== 'object' || typeof body.source !== 'string'
      || typeof body.imagePath !== 'string' || typeof Reflect.get(acquisition, 'imageSha256') !== 'string')
      throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
    const observation = { url: body.source, evidence: { path: body.imagePath, sha256: Reflect.get(acquisition, 'imageSha256') },
      capture: { path: ref.path, sha256: ref.sha256 } };
    if (ref.schema.startsWith('reference-discovery-entry-'))
      readCurrentDirectDiscoveryEntry(root, { ...observation, method: body.method, entry: body.entry });
    else readCurrentDiscoveryNavigation(root, observation);
  } else if (ref.schema === 'reference-flow-execution-v1') {
    readLiveReferenceFlow(root, { path: ref.path, sha256: ref.sha256 });
  }
  const document = body.documentSha256 ?? body.currentDocumentSha256;
  if (ref.schema === 'reference-control-observation-v1' && (!/^[a-f0-9]{64}$/.test(String(document))
    || typeof body.url !== 'string' || publicDiscoveryUrl(body.url) !== body.url
    || !Array.isArray(body.controls) || body.controls.length !== 1
    || typeof body.controls[0]?.selector !== 'string' || typeof body.controls[0]?.text !== 'string'
    || body.controls[0]?.url !== body.url)) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  if (current.documentSha256 !== null && document !== current.documentSha256)
    throw new JudgmentError('AI_JUDGMENT_SOURCE_STALE');
  let selected: unknown = body;
  let parent: unknown;
  for (const part of field.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || !selected || typeof selected !== 'object' || !Object.hasOwn(selected, key))
      throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
    parent = selected;
    selected = (selected as Record<string, unknown>)[key];
  }
  if (itemId !== null && (typeof parent !== 'object' || parent === null
    || ![Reflect.get(parent, 'id'), Reflect.get(parent, 'url'), Reflect.get(parent, 'selector')].includes(itemId)))
    throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  if (typeof selected !== 'string') throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  return { text: selected, sha256: ref.sha256, field, itemId, ...current };
}


/** Trust boundary: reads verified native request and current observation, not caller-supplied excerpts. */
export function nativeJudgmentSources(root: string, current: Omit<JudgmentVerificationContext, 'resolve'>,
  userTurn?: (ref: Extract<SourceRef, { kind: 'user-turn' }>) => Promise<{ text: string; sha256: string; sessionId: string; turnId: string; afterQuestionDigest: string | null }>,
): JudgmentVerificationContext['resolve'] {
  return async (ref, field, itemId): Promise<TrustedJudgmentSource> => {
    let text: string;
    let sha256: string;
    if (ref.kind === 'route-request') {
      const request = readPiRequest(root);
      if (!request || request.recordSha256 !== ref.requestSourceSha256 || request.requestSha256 !== ref.requestSha256 || field !== 'request' || itemId !== null) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
      text = request.request; sha256 = request.recordSha256;
    } else if (ref.kind === 'user-turn') {
      if (!userTurn || field !== 'text' || itemId !== null) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
      const turn = await userTurn(ref);
      if (turn.sha256 !== ref.sha256 || judgmentSha256(turn.text) !== ref.sha256 || turn.sessionId !== ref.sessionId || turn.turnId !== ref.turnId || turn.afterQuestionDigest !== current.questionDigest) throw new JudgmentError('AI_JUDGMENT_SOURCE_STALE');
      text = turn.text; sha256 = turn.sha256;
    } else if (ref.kind === 'receipt') {
      if (ref.schema !== 'observation-v2') return signedReferenceSource(root, current, ref, field, itemId);
      if (!field.startsWith('/evidence/') || ref.path !== '.omd/observation-v2.json') throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
      const observation = readCurrentObservationV2(root);
      if (!observation || observationV2Sha256(observation) !== ref.sha256) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
      if (current.documentSha256 !== null && observation.currentArtifact.sha256 !== current.documentSha256) throw new JudgmentError('AI_JUDGMENT_SOURCE_STALE');
      let selected: unknown = observation as unknown;
      let parent: unknown;
      for (const segment of field.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
        parent = selected;
        if (typeof selected !== 'object' || selected === null || !Object.hasOwn(selected, segment)) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
        selected = (selected as Record<string, unknown>)[segment];
      }
      if (itemId !== null && (typeof parent !== 'object' || parent === null || (parent as Record<string, unknown>).id !== itemId)) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
      if (typeof selected !== 'string') throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
      text = selected; sha256 = ref.sha256;
    } else {
      if (field !== 'content' || itemId !== null || artifactDigest(root, ref.path).sha256 !== ref.sha256) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
      text = readContainedRegularFile(root, ref.path, ref.path).toString('utf8'); sha256 = ref.sha256;
    }
    return { text, sha256, field, itemId, ...current };
  };
}

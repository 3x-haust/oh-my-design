import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { RouteRecord } from '../../route/index.ts';
import type { ReferenceDiscoveryAction, ReferenceDiscoveryWork } from '../discovery-work.ts';
import { canonicalJson, sha256 } from './json.ts';
import { readContainedRegularFile } from '../reference-selection.ts';
import { referenceServiceFamily } from '../design-discovery-sources.ts';
import { refIdentity } from '../identity.ts';
import { loadDesignCandidates } from '../reference-candidate.ts';
import { readAuthenticatedAdmissionHistory } from '../reference-direction-admission.ts';
import { loadRefs, refRecordPath } from '../store.ts';
import { readCurrentBrowseEvidence } from './evidence.ts';
import { evaluateBrowseStop, browseSaturation } from './budget.ts';
import { parseCanonical, readBrowseBytes, replayBrowseKeeps, verifySigned } from './trace.ts';
import { ACQUISITION, browseFail, type Binding, type BrowseEvent, type BrowseObservation, type Checkpoint, type Receipt } from './contract.ts';

type LivePointer = { binding: Binding; head: string | null; checkpoint: Receipt | null; seal: Receipt | null };
export function browseDiscoveryWork(root: string, route: Pick<RouteRecord, 'sourceContractSha256'>): ReferenceDiscoveryWork {
  const sealed = readCurrentBrowseEvidence(root, route.sourceContractSha256);
  const admissions = readAuthenticatedAdmissionHistory(root, route.sourceContractSha256).flatMap(item => item.admissions);
  const candidates = loadDesignCandidates(root);
  const pendingCandidates = candidates.filter(candidate => !admissions.some(row =>
    row.sourceId === refIdentity(candidate.reference.source, candidate.reference.component)
    && row.captureSha256 === sha256(candidate.capture) && row.imageSha256 === sha256(candidate.image)));
  const promotedDirections = loadRefs(root).flatMap(reference => {
    if (reference.researchLane !== 'design' || !reference.imagePath || !reference.acquisition?.imageSha256) return [];
    const imageSha256 = reference.acquisition.imageSha256;
    const capture = readContainedRegularFile(root, relative(root, refRecordPath(root, reference)), 'retained design capture');
    const admitted = admissions.some(row => row.verdict === 'direction'
      && row.sourceId === refIdentity(reference.source, reference.component)
      && row.captureSha256 === sha256(capture) && row.imageSha256 === imageSha256);
    if (!admitted) return [];
    if (sha256(readContainedRegularFile(root, reference.imagePath, 'retained design image')) !== imageSha256) {
      browseFail('BROWSE_RETAINED_IMAGE_CHANGED', 'the admitted retained image bytes changed', 2);
    }
    return [{ reference, imageSha256 }];
  });
  const pointerPath = '.omd/.cache/ref-browse/current.json';
  let live: LivePointer | null = null;
  if (existsSync(resolve(root, pointerPath))) {
    const pointer = parseCanonical<{ sessionId: string }>(readContainedRegularFile(root, pointerPath, 'browse pointer'));
    if (!/^[a-f0-9]{32}$/.test(pointer.sessionId)) browseFail('BROWSE_POINTER', 'invalid session pointer', 2);
    const state = parseCanonical<LivePointer>(readContainedRegularFile(root, `.omd/.cache/ref-browse/${pointer.sessionId}/state.json`, 'browse state'));
    if (state.binding.sourceContractSha256 === route.sourceContractSha256 && !state.seal) live = state;
  }
  let action: ReferenceDiscoveryAction, status: ReferenceDiscoveryWork['status'] = 'action';
  let discrete: unknown = sealed.map(item => item.session.sha256), observation: BrowseObservation | null = null;
  if (live) {
    let nativeStop: 'saturated' | 'interrupted' | null = null;
    if (live.checkpoint) {
      const checkpoint = parseCanonical<Checkpoint>(readBrowseBytes(root, live.checkpoint)); verifySigned(root, checkpoint);
      const trace = readContainedRegularFile(root, `.omd/discovery/browse/${live.binding.sessionId}/trace.jsonl`, 'browse trace');
      if (sha256(trace) !== checkpoint.traceSha256) browseFail('BROWSE_CHECKPOINT', 'live trace changed', 2);
      const events = trace.toString('utf8').trimEnd().split('\n').map(line => parseCanonical<BrowseEvent>(Buffer.from(`${line}\n`)));
      const meaningful = events.findLast(event => ACQUISITION.has(event.action.verb) || ['keep', 'drop', 'start', 'end'].includes(event.action.verb));
      const observations = new Map<string, BrowseObservation>();
      for (const event of events) if (event.observation) observations.set(event.observation.sha256, parseCanonical<BrowseObservation>(readBrowseBytes(root, event.observation)));
      const seen = events.findLast(event => event.observation)?.observation;
      if (seen) observation = observations.get(seen.sha256)!;
      if (events[0]?.error) nativeStop = 'interrupted';
      else if (live.binding.start.lane === 'design' && browseSaturation(replayBrowseKeeps(events, observations, live.binding.start.mode)) === 'yes') nativeStop = 'saturated';
      live = { ...live, binding: { ...live.binding, budget: checkpoint.budget } };
      discrete = { event: meaningful?.hash ?? null, budget: { actions: checkpoint.budget.actions, maxActions: checkpoint.budget.maxActions, deadline: checkpoint.budget.deadline } };
    }
    const stopping = nativeStop !== null || evaluateBrowseStop(live.binding.budget, Date.now()) !== null;
    action = { kind: stopping ? 'end-browse' : 'continue-browse', lane: live.binding.start.lane,
      args: stopping ? ['ref', 'browse', 'end', '--reason', nativeStop ?? 'budget', '--json'] : ['ref', 'browse', 'status', '--json'],
      reason: stopping ? 'Seal the bounded research attempt and carry unresolved gaps as confidence debt.'
        : 'Choose a recorded browse action from the visible observation. Inspect whole screens, keep concrete reasons, compare the tray, then author reference analysis.' };
  } else if (pendingCandidates.length > 0) {
    action = { kind: 'review-candidates', lane: 'design', args: ['ref', 'direction-review', '--json'],
      reason: 'Independent Eye must inspect the staged original pixels before any design reference can be retained or counted as a visual direction.' };
  } else {
    const exhausted = sealed.some(item => item.summary.stopReason === 'budget' || evaluateBrowseStop(item.verified.seal.budget, Date.now()) === 'budget'
      || item.verified.seal.confidenceDebt.some(debt => debt.code === 'browser-capability-gap'));
    const completed = new Set(sealed.map(item => item.summary.lane));
    const pending = (['design', 'domain'] as const).find(lane => !completed.has(lane));
    if (exhausted || !pending) {
      status = 'stopped-with-debt'; action = { kind: 'end-browse', lane: null, args: ['stage', 'next', '--json'],
        reason: 'Recorded research collection stopped. Carry gaps as confidence debt; proceed to the next selected nonreference stage/first render without claiming research completeness.' };
    } else action = { kind: 'start-browse', lane: pending, args: ['ref', 'browse', 'start', '--lane', pending, '--mode', 'headless', '--json'],
      reason: 'Model chooses the next public root/query. Provider lists are suggestions, never acquisition quotas or evidence admission authority.' };
  }
  const keeps = sealed.flatMap(item => item.verified.seal.keeps.map(keep => ({ lane: item.summary.lane, keep })));
  const progress = { domainFamilies: new Set(keeps.filter(item => item.lane === 'domain').map(item => referenceServiceFamily(item.keep.source))).size,
    designFamilies: new Set([
      ...keeps.filter(item => item.lane === 'design').map(item => referenceServiceFamily(item.keep.source)),
      ...promotedDirections.map(({ reference }) => referenceServiceFamily(reference.source)),
    ]).size,
    searches: 0, entries: 0, visits: 0, unavailable: sealed.reduce((sum, item) => sum + item.verified.events.filter(event => event.error).length, 0), ignored: 0 };
  const materialProgressIdentities = [
    ...keeps.map(item => `${item.lane}:${item.keep.source}:${item.keep.image.sha256}`),
    ...promotedDirections.map(({ reference, imageSha256 }) => `design:${reference.source}:${imageSha256}`),
  ].toSorted();
  return { schema: 'reference-discovery-work-v2', status, action, next: `omd ${action.args.join(' ')}`, instruction: action.reason,
    workSha256: sha256(canonicalJson({ contract: route.sourceContractSha256, status, action, discrete,
      pendingCaptures: pendingCandidates.map(candidate => sha256(candidate.capture)).toSorted(),
      materialProgressIdentities })), code: null, attempts: [], exclusions: [],
    materialProgressIdentities, circuits: [], progress,
    browse: { head: live?.head ?? null, budget: live?.binding.budget ?? sealed.at(-1)?.verified.seal.budget ?? null, observation, confidenceDebt: sealed.flatMap(item => item.verified.seal.confidenceDebt) } };
}

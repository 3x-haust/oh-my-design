import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readArtifact } from '../measure/inputs.ts';
import { sha256 } from '../measure/identity.ts';
import type { Receipt } from '../measure/types.ts';
import { recordRefinementObservation, refinementEscalation } from '../stage/refinement-work.ts';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import type { ProjectWriteAdapter } from './project-write.ts';
import { observationV2Sha256, validateObservationV2, type ObservationV2 } from './observation.ts';
import * as v from '../brief/candidate-data.ts';

function repairs(root: string, routeSha256: string, predecessors: readonly string[]) {
  const directory = '.omd/production-repairs';
  if (!existsSync(resolve(root, directory))) return [];
  return readdirSync(resolve(root, directory)).filter(name => /^sha256-[a-f0-9]{64}\.json$/.test(name)).flatMap(name => {
    const path = `${directory}/${name}`, bytes = readArtifact(root, path), value = v.object(JSON.parse(bytes.toString('utf8')));
    if (value.schema !== 'omd-production-repair-outcome-v3' || value.outcome !== 'committed' || value.routeSha256 !== routeSha256 || !predecessors.includes(String(value.predecessorSha256))) return [];
    if (name !== `sha256-${sha256(bytes)}.json`) v.fail('repair outcome bytes changed');
    return [{ receipt: { path, sha256: sha256(bytes) }, value }];
  });
}
/** Runs after an actual observation, including RED. No fabricated outcome or failed-attempt count. */
export function recordTrustedRefinementObservation(root: string, observation: ObservationV2, measurements: readonly Receipt[], writer: ProjectWriteAdapter, invocation: ProjectRunInvocation) {
  const route = readPersistedRoute(root, invocation);
  if (!route.sourceContract.processPolicy || !observation.predecessorSha256) return;
  const applicable = repairs(root, adaptiveRouteRecordSha256(route), [observation.predecessorSha256]);
  if (!applicable.length) return;
  if (applicable.length !== 1 || measurements.length !== 1) v.fail('post-repair measurement lineage must be unambiguous');
  const repair = applicable[0]!, reviewSha256 = v.sha(repair.value.reviewSha256);
  return recordRefinementObservation(root, { measurement: measurements[0]!, repair: repair.receipt,
    review: { path: `.omd/final-review/repairs/sha256-${reviewSha256}.json`, sha256: reviewSha256 } }, writer, invocation);
}
export function currentRefinementBinding(root: string, invocation: ProjectRunInvocation, observations: readonly string[]) {
  const route = readPersistedRoute(root, invocation), pending = refinementEscalation(root, route.sourceContractSha256);
  if (pending) v.fail(`NEEDS_REFINEMENT_DECISION:${pending.id}`);
  const lineage = new Set<string>(), remaining = [...observations];
  while (remaining.length) {
    const sha = v.sha(remaining.pop());
    if (lineage.has(sha)) continue;
    const observation = validateObservationV2(JSON.parse(v.readReceipt(root, { path: `.omd/observation-v2/sha256-${sha}.json`, sha256: sha }).toString('utf8')));
    if (observationV2Sha256(observation) !== sha) v.fail('refinement observation lineage changed');
    lineage.add(sha);
    if (observation.predecessorSha256) remaining.push(observation.predecessorSha256);
  }
  const required = repairs(root, adaptiveRouteRecordSha256(route), [...lineage]);
  const pointerPath = '.omd/refinement/policy.json';
  if (!existsSync(resolve(root, pointerPath))) {
    if (required.length) v.fail('native post-repair refinement observation is missing');
    return null;
  }
  const pointer = v.object(JSON.parse(readArtifact(root, pointerPath).toString('utf8')), ['schema', 'record']);
  v.enumeration(pointer.schema, ['refinement-policy-pointer-v1']);
  const head = v.receipt(pointer.record);
  const observedRepairs = new Set<string>();
  let cursor: Receipt | null = head;
  while (cursor) {
    const value = v.object(JSON.parse(v.readReceipt(root, cursor).toString('utf8')));
    if (value.sourceContractSha256 === route.sourceContractSha256) observedRepairs.add(v.receipt(value.repair).sha256);
    cursor = v.nullableReceipt(value.previous);
  }
  // refinementEscalation already authenticated the entire chain, including its immutable inputs.
  if (required.some(r => !observedRepairs.has(r.receipt.sha256))) v.fail('a committed repair has no native refinement observation');
  return { pointer: v.fileReceipt(root, pointerPath), head };
}

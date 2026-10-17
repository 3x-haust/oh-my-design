import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { measureProject } from '../measure/index.ts';
import { parseVisualMeasurement } from '../measure/schema.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { currentMakerSource } from '../runtime/native-maker-state.ts';
import {
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from '../runtime/project-write.ts';
import { selectedBaseTokens } from '../tokens/minimal.ts';
import { publishCandidatePacket } from './candidate-choice.ts';
import {
  CANDIDATE_PLAN_PATH,
  checkCandidatePlan,
  type CandidateSet,
} from './candidate-plan.ts';
import * as v from './candidate-data.ts';
import { readPersistedRoute } from '../route/index.ts';

function currentPlan(root: string, sourceContractSha256: string) {
  const pointer = v.object(
    JSON.parse(v.readBytes(root, CANDIDATE_PLAN_PATH).toString('utf8')),
    ['schema', 'plan'],
  );
  if (pointer.schema !== 'candidate-plan-pointer-v2') {
    return v.fail('current candidate plan pointer is required');
  }
  const receipt = v.receipt(pointer.plan);
  const checked = checkCandidatePlan(
    root,
    JSON.parse(v.readReceipt(root, receipt).toString('utf8')),
    sourceContractSha256,
  );
  return { receipt, ...checked };
}

function requireCurrentMakerOnlySource(root: string, candidateId: string): void {
  const directory = `.omd/.cache/sketches/${candidateId}`;
  const entries = readdirSync(join(root, directory), { recursive: true, withFileTypes: true });
  const files = entries.filter(entry => entry.isFile())
    .map(entry => `${entry.parentPath.slice(join(root, directory).length + 1)}/${entry.name}`
      .replace(/^\/+/, ''))
    .sort();
  if (files.length !== 1 || files[0] !== 'index.html'
    || entries.some(entry => entry.isSymbolicLink() || entry.isDirectory())) {
    v.fail('current native Sketch candidates must contain only the derived index.html source');
  }
}

/**
 * Measures the exact current native-Sketch outputs and publishes their candidate-set-v2 packet.
 * Candidate selection remains a separate owner.
 */
export async function captureAndPublishCandidateSet(
  root: string,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
) {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const route = readPersistedRoute(root, invocation);
  const { receipt: planReceipt, plan, seed } = currentPlan(root, route.sourceContractSha256);
  if (plan.representative.stateId !== 'initial') {
    return v.fail('candidate capture needs an authored state recipe for a non-initial representative state');
  }
  const candidates: CandidateSet['candidates'][number][] = [];
  for (const candidate of plan.candidates) {
    const owner = `sketch-${candidate.id}`;
    if (currentMakerSource(root, invocation, owner) === null) {
      v.fail(`candidate ${candidate.id} is not current native-maker source`);
    }
    requireCurrentMakerOnlySource(root, candidate.id);
    const sourcePath = `.omd/.cache/sketches/${candidate.id}/index.html`;
    const source = v.fileReceipt(root, sourcePath);
    const measured = await measureProject({
      root,
      entry: sourcePath,
      scope: {
        schema: 'visual-measurement-scope-v1',
        views: plan.views.map(view => ({
          id: view.id,
          viewport: { width: view.width, height: view.height },
          browserZoom: 1,
        })),
      },
      writer,
      invocation,
    });
    if (currentMakerSource(root, invocation, owner) === null) {
      v.fail(`candidate ${candidate.id} changed after native measurement`);
    }
    const packet = parseVisualMeasurement(
      JSON.parse(v.readReceipt(root, measured.packet).toString('utf8')),
    );
    const previews = plan.views.map(view => {
      const captured = packet.captures.find(capture => capture.viewId === view.id);
      const scope = packet.scope.find(item => item.id === view.id);
      if (captured === undefined || scope === undefined) {
        return v.fail(`candidate ${candidate.id} omitted required view ${view.id}`);
      }
      return {
        renderId: `${measured.packet.sha256}:${view.id}`,
        sourceSha256: source.sha256,
        surfaceId: plan.representative.surfaceId,
        stateId: plan.representative.stateId,
        viewId: view.id,
        viewport: scope.viewport,
        png: captured.capture,
        capture: measured.packet,
      };
    });
    candidates.push({
      id: candidate.id,
      source,
      assets: [],
      previews,
      effectiveTokensSha256: v.digest(selectedBaseTokens(seed, candidate.primitiveOverrides)),
      limitations: [],
    });
  }
  const candidateSet: CandidateSet = {
    schema: 'candidate-set-v2',
    plan: planReceipt,
    candidates,
  };
  return {
    candidateSet,
    publication: publishCandidatePacket(root, candidateSet, writer, invocation),
  };
}

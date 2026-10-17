import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';
import { parseMeasuredHandback } from '../adapters/measured-reviewer-publication.ts';
import { AXIS_METRICS } from '../core/measure/citations.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import {
  MEASURED_DESIGN_QUALITY_AXES,
  MEASURED_DESIGN_QUALITY_FLOORS,
} from '../core/evidence/final-v2-measured-quality.ts';
import {
  MEASURED_REVIEW_HANDBACK,
  measuredFinalRenderPacket,
} from '../core/runtime/trusted-measured-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

type Packet = Readonly<{
  evidence: {
    renders: Array<{
      observationSha256: string;
      captureSha256: string;
      packetSha256: string;
      viewId: string;
      state: string;
    }>;
  };
  outputContract: {
    verdictKeys: string[];
    criticalFloorKeys: string[];
    fixedBindings: Record<string, unknown> & {
      measurements: Array<{ path: string; sha256: string }>;
    };
  };
}>;

function measuredQuality(root: string, packet: Packet): Record<string, unknown> {
  const measurements = new Map(packet.outputContract.fixedBindings.measurements.map((receipt) => [
    receipt.sha256,
    loadMeasurement(root, receipt),
  ]));
  return {
    schema: 'design-quality-contract-v2',
    axes: MEASURED_DESIGN_QUALITY_AXES.map((axis) => ({
      axis,
      verdict: 'GREEN',
      score: MEASURED_DESIGN_QUALITY_FLOORS[axis],
      crossViewport: 'preserved',
      criticalFailure: null,
      evidence: packet.evidence.renders.map((render) => {
        const source = measurements.get(render.packetSha256);
        assert.ok(source);
        const measurementIds = source.measurements
          .filter((measurement) =>
            measurement.viewIds.includes(render.viewId)
            && measurement.coverage.status === 'complete'
            && (AXIS_METRICS[axis] as readonly string[]).includes(measurement.kind))
          .map(({ id }) => id);
        assert.equal(
          new Set(measurementIds.map((id) =>
            source.measurements.find((measurement) => measurement.id === id)?.kind)).size,
          AXIS_METRICS[axis].length,
        );
        return {
          observationSha256: render.observationSha256,
          captureSha256: render.captureSha256,
          viewId: render.viewId,
          state: render.state,
          regionSubjectIds: [],
          packetSha256: render.packetSha256,
          measurementIds,
          visibleCondition: 'The measured render clears the required axis inventory.',
          userConsequence: 'The current task remains legible across required views.',
        };
      }),
    })),
  };
}

async function fixture() {
  const prepared = await prepareFinalRenderReviewFixture();
  const packetBytes = measuredFinalRenderPacket(
    prepared.root,
    prepared.invocation,
    prepared.observationSha256s,
  );
  const packet = JSON.parse(packetBytes.toString('utf8')) as Packet;
  const handback = {
    schema: MEASURED_REVIEW_HANDBACK,
    lane: 'blindLane',
    verdicts: Object.fromEntries(packet.outputContract.verdictKeys.map((key) => [key, 'GREEN'])),
    criticalFloors: Object.fromEntries(packet.outputContract.criticalFloorKeys.map((key) => [
      key,
      key === 'composition' ? 4 : 3,
    ])),
    designQuality: measuredQuality(prepared.root, packet),
    ...packet.outputContract.fixedBindings,
    findings: [],
  };
  return { ...prepared, packetBytes, packet, handback };
}

const sharedFixture = fixture();

test('measured blind review refuses a handback without independent quality assessment', async () => {
  const state = await sharedFixture;
  const missing = { ...state.handback };
  delete (missing as Partial<typeof missing>).designQuality;
  assert.throws(
    () => parseMeasuredHandback(
      state.root,
      state.invocation,
      missing,
      state.packetBytes,
      'blindLane',
    ),
    /measured reviewer handback contract mismatch/,
  );
});

test('measured blind review requires every quality axis to clear its floor', async () => {
  const state = await sharedFixture;
  const quality = structuredClone(state.handback.designQuality) as {
    axes: Array<{ axis: string; verdict: string; score: number }>;
  };
  const beauty = quality.axes.find(({ axis }) => axis === 'beautyDesirability');
  assert.ok(beauty);
  beauty.verdict = 'RED';
  beauty.score = 1;
  assert.throws(
    () => parseMeasuredHandback(
      state.root,
      state.invocation,
      { ...state.handback, designQuality: quality },
      state.packetBytes,
      'blindLane',
    ),
    /DESIGN_QUALITY_AXIS_RED:beautyDesirability/,
  );
});

test('measured blind review accepts current native citations and rejects invented measurement ids', async () => {
  const state = await sharedFixture;
  try {
    const parsed = parseMeasuredHandback(
      state.root,
      state.invocation,
      state.handback,
      state.packetBytes,
      'blindLane',
    );
    assert.equal(parsed.quality?.axes.length, MEASURED_DESIGN_QUALITY_AXES.length);

    const stale = structuredClone(state.handback.designQuality) as {
      axes: Array<{ evidence: Array<{ measurementIds: string[] }> }>;
    };
    stale.axes[0]!.evidence[0]!.measurementIds[0] = `vm1:${'0'.repeat(64)}`;
    assert.throws(
      () => parseMeasuredHandback(
        state.root,
        state.invocation,
        { ...state.handback, designQuality: stale },
        state.packetBytes,
        'blindLane',
      ),
      /measurement id does not belong to cited packet/,
    );
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});

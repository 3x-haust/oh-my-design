/**
 * The reviewer-lane receipts a published final graph cites.
 *
 * A measured terminal keeps its selected lanes under `measuredTerminal.lanes` (an ordinary review selects only the
 * blind lane); an older graph carries all three lanes at the top level. Either way every cited lane must name a
 * receipt path, and a graph that cites none is refused.
 */
const LEGACY_LANES = ['blindLane', 'fidelityLane', 'protocolLane'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function finalReviewerLanePaths(graph: Record<string, unknown>): readonly string[] {
  const measured = graph.measuredTerminal;
  const lanes: ReadonlyArray<readonly [string, unknown]> = isRecord(measured)
    ? Object.entries(isRecord(measured.lanes) ? measured.lanes : {})
    : LEGACY_LANES.map(lane => [lane, graph[lane]] as const);
  if (lanes.length === 0) throw new Error('FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: the measured terminal selects no reviewer lane');
  return lanes.map(([lane, descriptor]) => {
    if (!isRecord(descriptor) || typeof descriptor.path !== 'string') {
      throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} receipt is required`);
    }
    return descriptor.path;
  });
}

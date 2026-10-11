import { canonicalJson, sha256 } from './json.ts';
import { readLiveReferenceFlow } from '../live-flow.ts';
import { verifyBrowseSession, type VerifiedBrowseSession } from './verification.ts';
import { parseCanonical, readBrowseBytes } from './trace.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../../runtime/project-write.ts';
import { browseFail, type Receipt } from './contract.ts';

function projectFlows(verified: VerifiedBrowseSession, session: Receipt) {
  if (verified.seal.lane !== 'domain') return [];
  const roots = verified.events.filter(event => event.action.verb === 'goto' && event.action.sourceId !== null && event.action.flowId !== null && event.outcome === 'observed');
  return roots.map(root => {
    if (root.action.verb !== 'goto') throw new Error('BROWSE_FLOW_ROOT');
    const end = verified.events.find(event => event.seq > root.seq && ['goto', 'external-intervention', 'end'].includes(event.action.verb))?.seq ?? verified.events.length;
    const range = verified.events.slice(root.seq, end), shots = range.filter(event => event.action.verb === 'shot' && event.action.selector === null && event.action.screenId && event.outcome === 'observed');
    let previous = root.seq; const assets: { receipt: Receipt; bytes: Buffer }[] = [];
    const steps = shots.map((event, index) => {
      if (event.action.verb !== 'shot' || !event.screenshot || !event.observation) throw new Error('BROWSE_FLOW_SHOT');
      const clicks = range.filter(item => item.seq > previous && item.seq < event.seq && item.outcome === 'observed' && ['click', 'similar'].includes(item.action.verb)).map(item => item.target!.selector);
      previous = event.seq;
      const assertions = [...event.action.assertVisible.map(selector => ({ state: 'visible' as const, selector })), ...event.action.assertHidden.map(selector => ({ state: 'hidden' as const, selector }))];
      const capture = { path: `.omd/refs/domain/flows/captures/${event.screenshot.sha256}.png`, sha256: event.screenshot.sha256 };
      assets.push({ receipt: capture, bytes: verified.assets.get(event.screenshot.sha256)! });
      const action = clicks.length ? clicks.map(selector => `click: ${selector}`).join(' \u2192 ') : 'observe current screen';
      const result = assertions.map(assertion => `${assertion.state}: ${assertion.selector}`).join('; ');
      const details = { schema: 'reference-browse-flow-step-v1', session, event: { seq: event.seq, hash: event.hash }, capture,
        sourceId: root.action.verb === 'goto' ? root.action.sourceId : null, screenId: event.action.screenId, state: event.action.state,
        action, result, assertions };
      const bytes = Buffer.from(`${canonicalJson(details)}\n`), digest = sha256(bytes), evidence = { path: `.omd/refs/domain/flows/steps/${digest}.json`, sha256: digest }; assets.push({ receipt: evidence, bytes });
      return { order: index + 1, screenId: event.action.screenId!, state: event.action.state!, url: event.finalUrl!, action, result, evidence, capture, clicks, assertions };
    });
    const completed = steps.length >= 2 && steps.every(step => step.assertions.some(assertion => assertion.state === 'visible'))
      && steps.slice(1).every(step => step.clicks.length > 0) && range.every(event => event.error === null
        && !(event.action.verb === 'shot' && event.action.selector !== null))
      && verified.events[end]?.action.verb === 'end';
    const record = { schema: 'reference-browse-flow-v1', session, range: { from: root.seq, to: end - 1 },
      input: { schema: 'reference-flow-input-v1' as const, sourceId: root.action.sourceId!, flowId: root.action.flowId!, url: root.action.url,
        viewport: verified.observations.get(root.observation!.sha256)!.viewport,
        steps: steps.map(({ screenId, state, clicks, assertions }) => ({ screenId, state, clicks, assertions })) },
      status: completed ? 'completed' as const : 'blocked' as const,
      limitation: completed ? null : 'Unasserted, disconnected, failed or non-interactive walkthrough; task completion is not inferred from labels.',
      steps: steps.map(({ clicks: _clicks, assertions: _assertions, ...step }) => step) };
    return { record, assets };
  });
}
export function publishBrowseFlowProjection(root: string, session: Receipt, writer: ProjectWriteAdapter): Receipt[] {
  requireProjectWriteAdapter(root, writer);
  return projectFlows(verifyBrowseSession(root, session), session).map(({ record, assets }) => {
    for (const item of assets) writer.writeContentAddressed(item.receipt.path, item.bytes);
    const bytes = `${canonicalJson(record)}\n`, digest = sha256(bytes), receipt = { path: `.omd/refs/domain/flows/executions/${digest}.json`, sha256: digest };
    writer.writeContentAddressed(receipt.path, bytes); return receipt;
  });
}
export function readNativeReferenceFlow(root: string, receipt: Receipt): ReturnType<typeof readLiveReferenceFlow> {
  const bytes = readBrowseBytes(root, receipt);
  if (JSON.parse(bytes.toString('utf8')).schema !== 'reference-browse-flow-v1') return readLiveReferenceFlow(root, receipt);
  const value = parseCanonical<{ schema: string; session?: Receipt }>(bytes);
  if (!value.session || receipt.path !== `.omd/refs/domain/flows/executions/${receipt.sha256}.json`) browseFail('BROWSE_FLOW_RECEIPT', 'invalid flow receipt', 2);
  const projection = projectFlows(verifyBrowseSession(root, value.session), value.session).find(item => sha256(`${canonicalJson(item.record)}\n`) === receipt.sha256);
  if (!projection) browseFail('BROWSE_FLOW_PROJECTION', 'flow differs from sealed events', 2);
  for (const asset of projection.assets) if (!readBrowseBytes(root, asset.receipt).equals(asset.bytes)) browseFail('BROWSE_FLOW_ASSET', 'flow asset differs', 2);
  return projection.record;
}

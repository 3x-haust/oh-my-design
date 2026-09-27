import { loadMeasurement } from '../measure/files.ts';
import { withBrowser } from '../render/index.ts';
import { requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import * as v from './candidate-data.ts';

export type GlancePacket = Readonly<{ schema: 'glance-packet-v1'; transform: { version: 'grayscale-blur-v1'; blurPx: 6 };
  renders: readonly { renderId: string; viewport: { width: number; height: number }; state: string;
    sourceCaptureSha256: string; squint: v.Receipt }[] }>;
/** Transform the verified capture bytes, never a new independent page navigation labeled as the
 * same original. Network is disabled; the only input to the renderer is the retained PNG. */
export async function createGlancePacket(root: string, measurements: readonly v.Receipt[], writer: ProjectWriteAdapter, invocation: ProjectRunInvocation) {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const inputs = measurements.flatMap(receipt => {
    const packet = loadMeasurement(root, receipt);
    return packet.captures.map(c => ({ receipt, capture: c, view: packet.scope.find(s => s.id === c.viewId)! }));
  });
  v.unique(inputs, i => `${i.receipt.sha256}:${i.view.id}`);
  if (!inputs.length) v.fail('Glance needs actual bound captures');
  const rendered = await withBrowser(async browser => {
    const out: Array<{ row: GlancePacket['renders'][number]; png: Buffer }> = [];
    for (const input of inputs) {
      const bytes = v.readReceipt(root, input.capture.capture), page = await browser.newPage({ viewport: input.capture.image, serviceWorkers: 'block' });
      try {
        await page.route('**/*', route => route.abort());
        await page.setContent('<html><head><style>html,body{margin:0;overflow:hidden}img{display:block;filter:grayscale(1) blur(6px)}</style></head><body><img alt=""></body></html>');
        await page.locator('img').evaluate(async (image, data) => { const img = image as HTMLImageElement; img.src = data; await img.decode(); }, `data:image/png;base64,${bytes.toString('base64')}`);
        const png = await page.screenshot(), sha256 = v.hash(png);
        out.push({ png, row: { renderId: `${input.receipt.sha256}:${input.view.id}`, viewport: input.view.viewport, state: input.view.state,
          sourceCaptureSha256: input.capture.capture.sha256, squint: { path: `.omd/.cache/glance/sha256-${sha256}.png`, sha256 } } });
      } finally { await page.close(); }
    }
    return out;
  });
  for (const receipt of measurements) loadMeasurement(root, receipt);
  for (const item of rendered) writer.writeContentAddressed(item.row.squint.path, item.png);
  const packet: GlancePacket = { schema: 'glance-packet-v1', transform: { version: 'grayscale-blur-v1', blurPx: 6 }, renders: rendered.map(r => r.row) };
  return { packet, packetSha256: v.digest(packet) };
}
export function validateGlanceReview(packet: GlancePacket, value: unknown) {
  const r = v.object(value, ['schema', 'packetSha256', 'observations']);
  v.enumeration(r.schema, ['glance-review-v1']);
  if (r.packetSha256 !== v.digest(packet)) v.fail('Glance packet changed');
  const observations = v.list(r.observations, value => {
    const x = v.object(value, ['renderId', 'viewport', 'state', 'sourceCaptureSha256', 'squintSha256', 'focalPoint', 'eyePath', 'perceivedRegions', 'hierarchyFailure', 'assessed']);
    const viewport = v.object(x.viewport, ['width', 'height']), renderId = v.text(x.renderId), expected = packet.renders.find(p => p.renderId === renderId);
    if (!expected || v.digest(expected.viewport) !== v.digest(viewport) || expected.state !== x.state
      || expected.sourceCaptureSha256 !== x.sourceCaptureSha256 || expected.squint.sha256 !== x.squintSha256) v.fail('Glance render/state/view/source/transform membership mismatch');
    return { renderId, viewport: expected.viewport, state: expected.state, sourceCaptureSha256: expected.sourceCaptureSha256,
      squintSha256: expected.squint.sha256, focalPoint: v.text(x.focalPoint), eyePath: v.list(x.eyePath, v.text),
      perceivedRegions: v.list(x.perceivedRegions, v.text), hierarchyFailure: x.hierarchyFailure === null ? null : v.text(x.hierarchyFailure), assessed: v.boolean(x.assessed) };
  });
  v.unique(observations, o => o.renderId);
  if (v.digest(observations.map(o => o.renderId).sort()) !== v.digest(packet.renders.map(o => o.renderId).sort())) v.fail('Glance must account for every capture');
  return { schema: 'glance-review-v1', packetSha256: r.packetSha256, observations, complete: observations.every(o => o.assessed) };
}

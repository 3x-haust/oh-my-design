import { basename, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { withBrowser } from '../render/index.ts';
import { withLocalView, pageRoute } from '../render/stateful.ts';
import { withZoomedLocalView, ZoomUnsupportedError } from '../render/browser-zoom.ts';
import { createPublicNetworkProxy, assertPublicNetworkUrl } from '../ref/public-network.ts';
import { disableUnproxiedRealtimeTransports } from '../ref/browser-security.ts';
import { requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { ViewRequest, ViewSpec, VisualMeasurement } from './types.ts';
import { BASELINE_VIEWS } from './types.ts';
import { captureMeasuredView } from './capture.ts';
import { loadContracts, inputBinding, methodIdentity } from './inputs.ts';
import { digest } from './identity.ts';
import { measureCaptures, type RetainedCapture } from './engine.ts';
import { publishMeasurement } from './files.ts';
import { parseMeasureScope } from './schema.ts';
export { captureMeasuredView } from './capture.ts';
export { loadMeasurement, currentMeasurementReceipt } from './files.ts';
export { BASELINE_VIEWS } from './types.ts';
export async function measureProject(input: { root: string; entry: string; scope?: unknown; writer: ProjectWriteAdapter; invocation: ProjectRunInvocation }) {
  const { root, writer, invocation } = input;
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const external = /^https?:\/\//.test(input.entry), url = external ? new URL(input.entry) : null;
  if (url && (url.username || url.password)) throw new Error('VISUAL_MEASUREMENT: credential-bearing URL refused');
  const local = external ? null : relative(root, resolve(root, input.entry.startsWith('file:') ? fileURLToPath(input.entry) : input.entry)).split('\\').join('/');
  if (local !== null && (!local || local.startsWith('../') || isAbsolute(local))) throw new Error('VISUAL_MEASUREMENT: entry must be contained in the project');
  const { contracts, inputs } = loadContracts(root), requests: ViewRequest[] = [];
  const compositionReceipt = inputs.find(i => i.kind === 'composition')?.receipt;
  const captureContext = compositionReceipt ? { compositionReceipt } : {};
  for (const request of [...BASELINE_VIEWS, ...(contracts.type?.requiredViews ?? []), ...(contracts.composition?.requiredViews ?? []), ...(input.scope === undefined ? [] : parseMeasureScope(input.scope))]) {
    const previous = requests.find(r => r.id === request.id);
    if (previous && digest(previous) !== digest(request)) throw new Error('VISUAL_MEASUREMENT: scope cannot replace a required view');
    if (!previous) requests.push(request);
  }
  parseMeasureScope({ schema: 'visual-measurement-scope-v1', views: requests });
  const scope: ViewSpec[] = requests.map(r => ({ id: r.id, viewport: r.viewport, browserZoom: r.browserZoom, route: r.state?.route ?? (url ? `${url.pathname}${url.search}${url.hash}` : `/${encodeURIComponent(basename(local!))}`), state: r.state?.name ?? 'initial', stateRecipeSha256: digest(r.state ?? { state: 'initial' }) }));
  const before = inputBinding(root, local, digest(scope), invocation), captures: RetainedCapture[] = [], unsupported: string[] = [];
  let method: VisualMeasurement['method'];
  await withBrowser(async browser => {
    method = methodIdentity(browser.version());
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i]!, view = scope[i]!;
      if (request.browserZoom === 2) {
        if (local === null) { unsupported.push(`${view.id}: browser zoom is only supported in the disposable local worker`); continue; }
        try { captures.push(await withZoomedLocalView(root, local, request.viewport, request.state, page => captureMeasuredView(page, view, contracts, captureContext))); }
        catch (error) { if (!(error instanceof ZoomUnsupportedError)) throw error; unsupported.push(error.message); }
      } else if (local !== null) captures.push(await withLocalView(browser, root, { page: local, viewport: request.viewport, ...(request.state ? { state: request.state } : {}) }, page => captureMeasuredView(page, view, contracts, captureContext)));
      else {
        if (request.state) throw new Error('VISUAL_MEASUREMENT: diagnostic URLs do not accept state actions');
        captures.push(await externalCapture(browser, url!, view, contracts));
      }
    }
  });
  const binding = inputBinding(root, local, digest(scope), invocation);
  if (digest({ ...before, scopeSha256: binding.scopeSha256 }) !== digest(binding)) throw new Error('VISUAL_MEASUREMENT: source/contracts changed during capture');
  const packet: VisualMeasurement = { schema: 'visual-measurement-v1', method: method!, binding, scope, captures: captures.map(c => c.binding), ...measureCaptures(captures, scope, contracts, method!), attestation: { kind: 'diagnostic-only', payloadSha256: '0'.repeat(64), signature: null } };
  const receipt = publishMeasurement(root, packet, captures, writer, invocation);
  return { schema: 'visual-measurement-command-v1' as const, packet: receipt, summary: packet.summary, coverage: { required: scope.length, captured: captures.length, incomplete: packet.measurements.filter(m => m.coverage.status !== 'complete').map(m => m.id), unsupported }, completionEligible: local !== null && packet.summary.deterministicVerdict === 'PASS' };
}
async function externalCapture(browser: Browser, url: URL, view: ViewSpec, contracts: ReturnType<typeof loadContracts>['contracts']): Promise<RetainedCapture> {
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!loopback) await assertPublicNetworkUrl(url.href);
  const proxy = loopback ? null : await createPublicNetworkProxy();
  const context = await browser.newContext({ viewport: view.viewport, serviceWorkers: 'block', acceptDownloads: false, ...(proxy ? { proxy: { server: proxy.server } } : {}) });
  const resources: string[] = [];
  try {
    await disableUnproxiedRealtimeTransports(context); await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => { const request = route.request(); if (!['GET', 'HEAD'].includes(request.method()) || loopback && new URL(request.url()).origin !== url.origin) return route.abort(); if (!loopback) { try { await assertPublicNetworkUrl(request.url()); } catch { return route.abort(); } } resources.push(request.url()); return route.continue(); });
    const page = await context.newPage(), response = await page.goto(url.href, { waitUntil: 'load', timeout: 15000 });
    if (!response?.ok()) throw new Error('VISUAL_MEASUREMENT: diagnostic navigation failed');
    view.route = pageRoute(page);
    const capture = await captureMeasuredView(page, view, contracts, { externalProvenance: { requestedUrl: url.href, resourceUrls: [...new Set(resources)].sort() } });
    // Resource provenance is diagnostic; it is not proof of the project's production tree.
    return capture;
  } finally { await context.close(); await proxy?.close(); }
}

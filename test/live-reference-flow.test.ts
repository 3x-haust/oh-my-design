import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { withBrowser } from '../core/render/index.ts';
import { recordLiveReferenceFlow, readLiveReferenceFlow, parseLiveFlowInput } from '../core/ref/live-flow.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { parseTaskFlowBenchmark, validateTaskFlowBenchmarkEvidence } from '../core/ref/task-flow-benchmark.ts';

const url = 'https://reference.example/';
const input = { schema: 'reference-flow-input-v1', sourceId: 'service-a', flowId: 'inspect', url, viewport: { width: 1280, height: 900 }, steps: [
  { screenId: 'entry', state: 'initial', clicks: [], assertions: [{ selector: 'h1', state: 'visible', text: 'Service' }] },
  { screenId: 'detail', state: 'details', clicks: ['#detail-link'], assertions: [{ selector: 'h1', state: 'visible', text: 'Detail' }] },
  { screenId: 'expanded', state: 'requirements-expanded', clicks: ['#expand'], assertions: [{ selector: '#requirements', state: 'visible' }] },
] };
const body = (detail = false) => `<html><head><title>Service information</title></head><body><h1>${detail ? 'Detail' : 'Service'}</h1><p>${'Public service information and preparation guidance. '.repeat(8)}</p><a id="detail-link" href="/detail">Inspect details</a><button id="expand" type="button" aria-controls="requirements" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.getElementById('requirements').hidden=false">Requirements</button><div hidden id="requirements">Bring identification</div><a id="delete" href="/delete">Delete account</a></body></html>`;

test('native recorder executes one real navigation/disclosure chain and refuses tampered or different-project receipts', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-live-reference-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  await withBrowser(async browser => {
    const requests: string[] = [];
    const proxy = new Proxy(browser, { get(target, prop) {
      if (prop !== 'newContext') return Reflect.get(target, prop, target);
      return async (...args: Parameters<typeof browser.newContext>) => {
        const context = await browser.newContext(...args), newPage = context.newPage.bind(context);
        context.newPage = async () => { const page = await newPage(); await page.route('https://reference.example/**', async route => {
          requests.push(route.request().url()); await route.fulfill({ status: 200, contentType: 'text/html', body: body(route.request().url().endsWith('/detail')) });
        }); return page; };
        return context;
      };
    } });
    const result = await recordLiveReferenceFlow(proxy, root, input, writer);
    assert.equal(result.status, 'completed', result.limitation ?? '');
    assert.equal(readLiveReferenceFlow(root, result.execution).steps.length, 3);
    const otherRoot = realpathSync(mkdtempSync(join(tmpdir(), 'omd-live-other-project-')));
    t.after(() => rmSync(otherRoot, { recursive: true, force: true }));
    cpSync(join(root, '.omd'), join(otherRoot, '.omd'), { recursive: true });
    assert.throws(() => readLiveReferenceFlow(otherRoot, result.execution), /signature invalid/, 'even copying keys and receipts cannot change the bound project root');
    assert.ok(requests.includes(`${url}detail`));
    const screens = result.steps.map((step, index) => ({ id: step.screenId, name: step.screenId, url: step.url, state: step.state, reachedBy: { fromScreenId: index ? result.steps[index - 1]!.screenId : null, action: step.action, result: step.result }, evidence: step.capture }));
    const source = { id: 'service-a', url, kind: 'same-domain-service', observedAt: '2026-09-20', coverage: { scope: 'Public entry, detail and requirements only', status: 'complete', discoveredTargetCount: 3, entryScreenIds: ['entry'], inspectedScreenIds: screens.map(s => s.id), excludedTargets: [] }, screens,
      features: [{ id: 'requirements', name: 'Inspect requirements', behavior: 'Open public details and requirements', screenIds: screens.map(s => s.id) }],
      flows: [{ id: 'inspect', intent: 'Inspect public information', status: 'completed', limitation: null, execution: result.execution, steps: result.steps.map(({ order, screenId, action, result, evidence }) => ({ order, screenId, action, result, evidence })) }], observedPatterns: ['Public disclosure'], forbiddenTransfers: ['Brand and service facts'] };
    // Fixture API validates one source's trace; benchmark parser separately enforces source count.
    const benchmark = { schema: 'task-flow-benchmark-v2', sourceContractSha256: 'a'.repeat(64), surface: 'product', domain: 'public service', sources: [source], taskSteps: [], counterexamples: [] } as unknown as ReturnType<typeof parseTaskFlowBenchmark>;
    assert.equal(validateTaskFlowBenchmarkEvidence(root, benchmark).liveFlowVerified, true);
    const wrong = structuredClone(benchmark); (wrong.sources[0]!.flows[0]!.steps[1] as { action: string }).action = 'submit application';
    assert.throws(() => validateTaskFlowBenchmarkEvidence(root, wrong), /NATIVE_STEP_MISMATCH/);
    const blocked = await recordLiveReferenceFlow(proxy, root, { ...input, steps: [input.steps[0], { ...input.steps[1], clicks: ['#delete'] }] }, writer);
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.steps.length, 1);
    assert.ok(!requests.some(request => request.endsWith('/delete')));
    const saved = JSON.parse(readFileSync(join(root, result.execution.path), 'utf8'));
    saved.steps[1].action = 'forged';
    const bytes = JSON.stringify(saved), digest = createHash('sha256').update(bytes).digest('hex');
    const forged = { path: `.omd/refs/domain/flows/executions/${digest}.json`, sha256: digest };
    writer.write(forged.path, bytes);
    assert.throws(() => readLiveReferenceFlow(root, forged), /signature invalid/);
    writeFileSync(join(root, result.steps[1]!.capture.path), 'changed image');
    assert.throws(() => readLiveReferenceFlow(root, result.execution), /evidence changed/);
  });
});

test('reference flow intake cannot request local services, form writes or credential-bearing URLs', () => {
  for (const rejected of ['http://reference.example/', 'https://localhost/', 'https://127.0.0.1/', 'https://user:password@reference.example/']) assert.throws(() => parseLiveFlowInput({ ...input, url: rejected }));
  assert.throws(() => parseLiveFlowInput({ ...input, steps: [{ ...input.steps[0], fill: { password: 'secret' } }] }));
});

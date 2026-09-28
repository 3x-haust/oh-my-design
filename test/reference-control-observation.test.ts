import test from 'node:test';
import assert from 'node:assert/strict';
import { withBrowser } from '../core/render/index.ts';
import { captureReferenceControlObservation } from '../core/ref/control-observation.ts';
import { referenceJudgmentPolicy } from '../core/ref/judgment-policy.ts';
import { nativeJudgmentSources } from '../core/judgment/sources.ts';
import { verifyJudgment, type JudgmentInput } from '../core/judgment/index.ts';
import { discoveryFixture } from './helpers/discovery-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const url = 'https://reference.example/';
test('signed current control receipt binds a quote to the exact selector and document', async t => {
  const root = discoveryFixture(t);
  const captured = await withBrowser(browser => {
    const intercepted = new Proxy(browser, { get(target, property) {
      if (property !== 'newContext') return Reflect.get(target, property, target);
      return async (...args: Parameters<typeof browser.newContext>) => {
        const context = await browser.newContext(...args);
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          await page.route('https://reference.example/**', route => route.fulfill({ status: 200, contentType: 'text/html',
            body: '<html><body><a id="details" href="/details">Inspect details</a><a id="other" href="/other">Inspect other</a></body></html>' }));
          return page;
        };
        return context;
      };
    } });
    return captureReferenceControlObservation(intercepted, root, { url, selector: '#details' }, createTestProjectWriteAdapter(root));
  });
  const current = { requestSha256: 'a'.repeat(64), sourceContractSha256: null, questionDigest: null,
    documentSha256: captured.documentSha256 };
  const policy = referenceJudgmentPolicy('reference-action', [captured.field]);
  const judgment: JudgmentInput = { schema: 'ai-judgment-v1', purpose: 'reference-action', subjectId: `${url}#details`,
    context: current, decision: 'read-only-navigation', reason: 'Agent assessment',
    quotes: [{ source: { kind: 'receipt', ...captured.receipt }, field: captured.field,
      itemId: captured.itemId, text: 'Inspect details' }], evidence: [], payload: {} };
  const context = { ...current, resolve: nativeJudgmentSources(root, current) };
  assert.equal((await verifyJudgment(judgment, policy, context)).judgment.decision, 'read-only-navigation');
  await assert.rejects(verifyJudgment({ ...judgment, quotes: [{ ...judgment.quotes[0]!, text: 'Unseen action' }] }, policy, context), /AI_JUDGMENT_QUOTE_MISMATCH/);
  await assert.rejects(verifyJudgment({ ...judgment, quotes: [{ ...judgment.quotes[0]!, itemId: '#other' }] }, policy, context), /AI_JUDGMENT_SOURCE_UNVERIFIED/);
  await assert.rejects(verifyJudgment(judgment, policy, { ...context, documentSha256: 'b'.repeat(64) }), /AI_JUDGMENT_CONTEXT_MISMATCH/);
});

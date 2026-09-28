import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import { publishJudgment, type JudgmentInput, type SourceRef } from '../../core/judgment/index.ts';
import { referenceJudgmentPolicy, type ReferenceJudgmentBinding, type ReferenceJudgmentPurpose } from '../../core/ref/judgment-policy.ts';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** Test-owned signed observation of the real browser element, captured before the action. */
export async function signedBrowserJudgment(page: Page, selector: string, url: string,
  purpose: ReferenceJudgmentPurpose, decision: string): Promise<ReferenceJudgmentBinding> {
  const observed = await page.locator(selector).innerText();
  const sourceBytes = JSON.stringify({ url, selector, observed });
  const sha256 = hash(sourceBytes);
  const subjectId = `${url}#${selector}`;
  const requestSha256 = hash('test authenticated request');
  const documentSha256 = hash(await page.content());
  const ref: SourceRef = { kind: 'receipt', path: `.omd/discovery/test/sha256-${sha256}.json`, sha256, schema: 'browser-observation-v1' };
  const memory = new Map<string, string>();
  const source = async (candidate: SourceRef, field: string, itemId: string | null) => {
    if (candidate.kind !== 'receipt' || candidate.sha256 !== sha256 || hash(sourceBytes) !== sha256 || field !== 'observed' || itemId !== selector)
      throw new Error('unsigned or mismatched source');
    if (hash(await page.content()) !== documentSha256) throw new Error('document changed');
    return { sha256, field, itemId, text: observed, requestSha256, sourceContractSha256: null, questionDigest: null, documentSha256 };
  };
  const context = { requestSha256, sourceContractSha256: null, questionDigest: null, documentSha256, resolve: source };
  const policy = referenceJudgmentPolicy(purpose, ['observed']);
  const judgment: JudgmentInput = { schema: 'ai-judgment-v1', purpose, subjectId,
    context: { requestSha256, sourceContractSha256: null, questionDigest: null, documentSha256 },
    decision, reason: 'Test owner assessment of the current signed browser observation',
    quotes: [{ source: ref, field: 'observed', itemId: selector, text: observed.slice(0, 180) }], evidence: [], payload: {} };
  const receipt = await publishJudgment(judgment, policy, { ...context,
    author: { role: 'scout', invocationSha256: hash('test invocation') }, now: () => '2026-09-28T00:00:00.000Z',
    sign: digest => `signed:${digest}`, write: async (path, bytes) => { memory.set(path, bytes); } });
  return { receipt, subjectId, fields: ['observed'], context: { ...context,
    read: async path => Buffer.from(memory.get(path)!), verifySignature: (digest: string, signature: string) => signature === `signed:${digest}` } };
}

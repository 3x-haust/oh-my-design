import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../../core/ref/board-artifacts.ts';
import { signNativeObservation } from '../../core/runtime/self-signed-activation.ts';

export function routeInput() {
  const input = JSON.parse(readFileSync(new URL('../fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  input.request = '한국어로 복지 혜택을 찾고 신청을 준비하는 서비스를 만든다.';
  input.taskOutcome.goal = '복지 혜택을 찾아 신청을 준비한다.';
  return input;
}

export function fixture(t: { after(fn: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-discovery-work-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

export function unavailableSearch(root: string, input: { readonly lane: 'domain' | 'design'; readonly query: string;
  readonly url: string; readonly queryParam: string }, observedAt = new Date().toISOString()): void {
  const unsigned = { schema: 'reference-search-execution-v3', lane: input.lane, query: input.query,
    queryParam: input.queryParam, requestedUrl: input.url, finalUrl: null,
    provider: new URL(input.url).hostname, observedAt,
    status: 'navigation-error', httpStatus: null, links: [], results: [], capture: null,
    error: 'network failure', limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const directory = join(root, `.omd/discovery/${input.lane}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `search-${sha256(bytes)}.json`), bytes);
}

export function unavailableEntry(root: string, lane: 'domain' | 'design', url: string): void {
  const unsigned = { schema: 'reference-discovery-attempt-v1', source: url, researchLane: lane,
    method: 'direct-public', entry: lane === 'domain' ? 'public-directory' : 'free-gallery', capturedAt: new Date().toISOString(),
    httpStatus: null, outcome: 'unavailable', reason: 'network-failure' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const directory = join(root, `.omd/discovery/${lane}/attempts`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${sha256(bytes)}.json`), bytes);
}

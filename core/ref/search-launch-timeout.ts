import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import { canonicalJson, sha256 } from './board-artifacts.ts';
import { SEARCH_EXECUTION_SCHEMA } from './search-execution.ts';
import type { parseSearchInput } from './search-execution.ts';

/** Browser launch can expire before executeReferenceSearch owns a page or can write a receipt. */
export function publishSearchLaunchTimeout(input: ReturnType<typeof parseSearchInput>, writer: ProjectWriteAdapter) {
  const unsigned = { schema: SEARCH_EXECUTION_SCHEMA, lane: input.lane, query: input.query, queryParam: input.queryParam,
    requestedUrl: input.url, finalUrl: null, provider: new URL(input.url).hostname, observedAt: new Date().toISOString(),
    status: 'navigation-error' as const, httpStatus: null, links: [], results: [], capture: null,
    error: 'REFERENCE_ACQUISITION_TIMEOUT: browser launch exceeded its acquisition budget',
    limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested' as const };
  const execution = { ...unsigned,
    signature: signNativeObservation(writer.projectRoot, SEARCH_EXECUTION_SCHEMA, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(execution, null, 2)}\n`;
  const receipt = { path: `.omd/discovery/${input.lane}/search-${sha256(bytes)}.json`, sha256: sha256(bytes) };
  writer.write(receipt.path, bytes);
  return receipt;
}

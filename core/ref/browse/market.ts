import { sha256 } from '../board-artifacts.ts';
import type { MarketLaneCoverage } from '../market-reference-coverage-contract.ts';
import type { ResearchSource } from '../reference-research-types.ts';
import { isMarketQualifiedQuery, isKoreanLanguageServiceText } from '../market-reference.ts';
import { selfRootTaskClaim } from '../market-task-claim.ts';
import { marketClaimFits } from '../market-reference-coverage.ts';
import { verifyBrowseSession } from './verification.ts';
import { validateBrowseSourceCoverage } from '../reference-research-browse.ts';
import { browseFail, type Receipt } from './contract.ts';

export function readBrowseMarketExecutions(root: string, sessions: readonly Receipt[]) {
  return sessions.flatMap(session => {
    const verified = verifyBrowseSession(root, session);
    return verified.events.filter(event => event.action.verb === 'search' || event.action.verb === 'goto').map(event => ({
      session, event, observation: event.observation ? verified.observations.get(event.observation.sha256) ?? null : null }));
  }).sort((a, b) => Date.parse(a.event.time) - Date.parse(b.event.time) || a.event.seq - b.event.seq);
}
export function validateBrowseMarketLocal(root: string, source: ResearchSource, local: MarketLaneCoverage['localSources'][number],
  lane: 'DOMAIN' | 'DESIGN', marketRegion: string, labels: readonly string[], taskCategory: string): void {
  if (!source.provenance || !local.browseEvent || !local.claim || local.provenanceReceiptSha256 !== source.provenance.session.sha256) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_PROVENANCE', 'bound session, event and claim required', 2);
  const verified = verifyBrowseSession(root, source.provenance.session);
  validateBrowseSourceCoverage(root, source, lane === 'DOMAIN' ? 'domain' : 'design', verified.seal.sourceContractSha256);
  const event = verified.events[local.browseEvent.seq], claim = local.claim;
  const observation = event?.observation ? verified.observations.get(event.observation.sha256) : undefined;
  if (!event || event.hash !== local.browseEvent.hash || event.outcome !== 'observed' || !observation) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_EVENT', 'claim event was not observed', 2);
  let text: string | undefined;
  if (claim.kind === 'link-label') text = observation.linkClaims.find(link => link.url === claim.linkUrl && claim.linkUrl === source.url && sha256(link.text) === claim.textSha256)?.text;
  else if (claim.linkUrl === null && event.finalUrl === source.url && observation.kind !== 'image') text = observation.taskText.split('\n').find(line => sha256(line) === claim.textSha256);
  if (!text || !marketClaimFits(text, local.scope, marketRegion, labels)
    || (lane === 'DOMAIN' && marketRegion === 'KR' && !isKoreanLanguageServiceText(observation.text))
    || (lane === 'DOMAIN' && !selfRootTaskClaim(taskCategory, text))) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_SCOPE', 'visible source-specific market/task claim is missing; locale, query and unrelated page text do not count', 2);
  const age = Date.now() - Date.parse(event.time);
  if (age > 7 * 86400_000 || age < -300_000) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_STALE', 'market claim is stale', 2);
}
export function validateBrowseMarketFallback(root: string, source: ResearchSource, binding: { provenanceReceiptSha256: string },
  sessions: readonly Receipt[], labels: readonly string[]): void {
  if (!source.provenance || source.provenance.session.sha256 !== binding.provenanceReceiptSha256) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_FALLBACK', 'global source must bind its own native session', 2);
  const verified = verifyBrowseSession(root, source.provenance.session), capture = verified.events[source.provenance.capture.seq]!;
  const attempts = readBrowseMarketExecutions(root, sessions).filter(item => Date.parse(item.event.time) < Date.parse(capture.time) || (item.session.sha256 === source.provenance!.session.sha256 && item.event.seq < capture.seq));
  if (!attempts.some(({ event, observation }) => (event.action.verb === 'search' && event.action.scope === 'target-market' && isMarketQualifiedQuery(event.action.query, labels))
    || (event.action.verb === 'goto' && event.action.scope === 'target-market' && observation?.text.split('\n').some(text => marketClaimFits(text, 'service', '', labels))))) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_ORDER', 'a recorded market-qualified attempt must precede the global capture', 2);
}

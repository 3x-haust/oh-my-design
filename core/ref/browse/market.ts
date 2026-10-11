import { sha256 } from '../board-artifacts.ts';
import type { MarketLaneCoverage } from '../market-reference-coverage-contract.ts';
import type { ResearchSource } from '../reference-research-types.ts';
import { verifyBrowseSession } from './verification.ts';
import { validateBrowseSourceCoverage } from '../reference-research-browse.ts';
import { browseFail, type Receipt } from './contract.ts';

export function readBrowseMarketExecutions(root: string, sessions: readonly Receipt[]) {
  return sessions.flatMap(session => {
    const verified = verifyBrowseSession(root, session);
    return verified.events.filter(event => event.action.verb === 'search' || event.action.verb === 'goto').map(event => ({
      session, sourceContractSha256: verified.seal.sourceContractSha256, event, observation: event.observation ? verified.observations.get(event.observation.sha256) ?? null : null }));
  }).sort((a, b) => Date.parse(a.event.time) - Date.parse(b.event.time) || a.event.seq - b.event.seq);
}
export function validateBrowseMarketLocal(root: string, source: ResearchSource, local: MarketLaneCoverage['localSources'][number],
  lane: 'DOMAIN' | 'DESIGN', marketRegion: string, _labels: readonly string[], taskCategory: string) {
  if (!source.provenance || !local.browseEvent || !local.claim || local.provenanceReceiptSha256 !== source.provenance.session.sha256) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_PROVENANCE', 'bound session, event and claim required', 2);
  const verified = verifyBrowseSession(root, source.provenance.session);
  validateBrowseSourceCoverage(root, source, lane === 'DOMAIN' ? 'domain' : 'design', verified.seal.sourceContractSha256);
  const event = verified.events[local.browseEvent.seq], claim = local.claim;
  const observation = event?.observation ? verified.observations.get(event.observation.sha256) : undefined;
  if (!event || event.hash !== local.browseEvent.hash || event.outcome !== 'observed' || !observation) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_EVENT', 'claim event was not observed', 2);
  let text: string | undefined;
  if (claim.kind === 'link-label') text = observation.linkClaims.find(link => link.url === claim.linkUrl && claim.linkUrl === source.url && sha256(link.text) === claim.textSha256)?.text;
  else if (claim.linkUrl === null && event.finalUrl === source.url && observation.kind !== 'image') text = observation.taskText.split('\n').find(line => sha256(line) === claim.textSha256);
  if (!text) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_SCOPE', 'visible source-specific quoted bytes are missing; locale, query and hidden page text do not count', 2);
  const age = Date.now() - Date.parse(event.time);
  if (age > 7 * 86400_000 || age < -300_000) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_STALE', 'market claim is stale', 2);
  return { provenance: 'verified' as const, marketScope: 'unclear' as const, taskCapability: 'unclear' as const,
    sourceUrl: source.url, marketRegion, taskCategory };
}
export function validateBrowseMarketFallback(root: string, source: ResearchSource, binding: {
  provenanceReceiptSha256: string;
  gap: Pick<NonNullable<MarketLaneCoverage['globalFallback']>['gap'], 'attemptedQueries' | 'attemptedRoots'>;
}, sessions: readonly Receipt[], _labels: readonly string[]): void {
  if (!source.provenance || source.provenance.session.sha256 !== binding.provenanceReceiptSha256) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_FALLBACK', 'global source must bind its own native session', 2);
  const verified = verifyBrowseSession(root, source.provenance.session);
  const capture = verified.events[source.provenance.capture.seq];
  if (!capture || capture.hash !== source.provenance.capture.hash) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_FALLBACK', 'global capture event is not current', 2);
  const now = Date.now();
  const attempts = readBrowseMarketExecutions(root, sessions).filter(({ session, sourceContractSha256, event }) => {
    const action = event.action;
    const age = now - Date.parse(event.time);
    return age >= -300_000 && age <= 7 * 86400_000 && sourceContractSha256 === verified.seal.sourceContractSha256
      && (action.verb === 'search' || action.verb === 'goto') && action.scope === 'target-market'
      && (session.sha256 === source.provenance!.session.sha256 ? event.seq < capture.seq : Date.parse(event.time) < Date.parse(capture.time));
  });
  if (!attempts.length) browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_ORDER', 'a signed target-market attempt must precede the global capture', 2);
  const queries = new Set(attempts.flatMap(({ event }) => event.action.verb === 'search' ? [event.action.query] : []));
  const roots = new Set(attempts.flatMap(({ event }) => event.action.verb === 'goto' ? [event.action.url] : []));
  if ((!binding.gap.attemptedQueries.length && !binding.gap.attemptedRoots.length)
    || binding.gap.attemptedQueries.some(query => !queries.has(query))
    || binding.gap.attemptedRoots.some(url => !roots.has(url))) {
    browseFail('REFERENCE_RESEARCH_MARKET_BROWSE_ATTEMPT', 'declared gap attempts must match exact prior signed queries and roots', 2);
  }
}

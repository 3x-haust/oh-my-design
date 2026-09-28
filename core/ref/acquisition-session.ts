import { withBrowser } from '../render/index.ts';
import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { canonicalJson } from './board-artifacts.ts';
import { classifyKoreanServiceText } from './market-reference.ts';
import { DOMAIN_OBSERVATION_SCHEMA, DOMAIN_STATIC_FETCH_LIMITATIONS, type DomainObservationRecord } from './domain-observation.ts';
import { discoveryDigest, directDiscoveryEntry, discoveryLane, publicDiscoveryUrl, validateDirectDiscoveryLinks,
  type DirectDiscoveryEntry, type DiscoveryLane } from './discovery-record.ts';
import { captureReferenceNavigation, publishFailedAttempt, ReferenceNavigationError, type ReferenceNavigationReceipt } from './navigation-capture.ts';
import { fetchDomainHtml, type DomainFetchTransport } from './domain-fetch.ts';
import { readReferenceBrowserConfig, selectReferenceAcquisitionEngine, type BrowserConnector, type ReferenceBrowserConfig } from './browser-config.ts';
import { captureUserBrowserNavigation } from './user-browser-navigation.ts';
import type { UserBrowserDriver } from '../browser/contracts.ts';
import type { PublicHostLookup } from './public-network.ts';
import { handoffBrowserChallenge, launchBrowserProfileLogin } from './browser-profile.ts';
import { readBrowserConsent } from './browser-consent.ts';
import { detectBlockReason } from '../render/index.ts';
import { searchChallengeReason } from './search-execution.ts';
import { NAVIGATION_BUDGET_MS, AcquisitionTimeoutError, withAcquisitionDeadline,
  type AcquisitionDeadlineScope } from './acquisition-deadline.ts';

export function createReferenceAcquisitionSession(writer: ProjectWriteAdapter, options: Readonly<{
  fetchDomain?: DomainFetchTransport; browserConnector?: BrowserConnector; browserConfig?: ReferenceBrowserConfig;
  userBrowserDriver?: UserBrowserDriver; userBrowserLookup?: PublicHostLookup; consentHome?: string;
}> = {}) {
  const config = options.browserConfig ?? readReferenceBrowserConfig();
  return {
    async navigate(source: string, requestedLane: DiscoveryLane, requestedEntry?: DirectDiscoveryEntry,
      parentScope?: AcquisitionDeadlineScope): Promise<ReferenceNavigationReceipt> {
      const url = publicDiscoveryUrl(source); const lane = discoveryLane(requestedLane);
      const entry = requestedEntry === undefined ? undefined : directDiscoveryEntry(requestedEntry, lane);
      const engine = await selectReferenceAcquisitionEngine(config, { ...(options.consentHome ? { home: options.consentHome } : {}),
        ...(options.userBrowserDriver ? { driver: options.userBrowserDriver } : {}) });
      const userBrowser = engine === 'user-browser';
      const acquireUserBrowser = (scope?: AcquisitionDeadlineScope) => captureUserBrowserNavigation(writer, url, lane, entry,
        { ...(options.userBrowserDriver ? { driver: options.userBrowserDriver } : {}),
          ...(options.userBrowserLookup ? { lookup: options.userBrowserLookup } : {}), ...(scope ? { scope } : {}) });
      if (lane === 'design') {
        const acquire = (selected: ReferenceBrowserConfig) => withBrowser(browser => captureReferenceNavigation(browser, url, lane, writer,
          entry as 'free-gallery' | undefined, parentScope, selected, false), parentScope, { reference: true, config: selected,
          ...(options.browserConnector ? { connector: options.browserConnector } : {}) });
        try { return userBrowser ? await acquireUserBrowser(parentScope) : await acquire(config); }
        catch (error) {
          if (parentScope?.signal.aborted) throw error;
          const message = error instanceof Error ? error.message : '';
          if (!userBrowser && readBrowserConsent(options.consentHome) === 'consented' && config.mode === 'profile'
            && (/challenge page/i.test(message) || /login form/i.test(message))) {
            const cleared = /login form/i.test(message)
              ? await launchBrowserProfileLogin({ sites: [url], ...(parentScope ? { signal: parentScope.signal } : {}) }) === 'closed'
              : await handoffBrowserChallenge({ url, ...(parentScope ? { signal: parentScope.signal } : {}), cleared: async page => {
                const body = await page.locator('body').innerText();
                return !searchChallengeReason(body) && !detectBlockReason(await page.title(), body.length, 200, true);
              } });
            if (cleared) {
              try { return await acquire(config); } catch (retryError) { error = retryError; }
            }
          }
          const attempt = publishFailedAttempt(writer, url, lane, entry,
            error instanceof ReferenceNavigationError ? error.httpStatus : null, error, userBrowser ? 'user-browser' : undefined);
          throw new ReferenceNavigationError(error instanceof Error ? error.message : 'design acquisition failed', attempt);
        }
      }
      try {
        const result = await withAcquisitionDeadline({ budgetMs: userBrowser ? 180_000 : NAVIGATION_BUDGET_MS, phase: 'ref navigate' }, async scope => {
          let fetched;
          try {
            fetched = await withAcquisitionDeadline({ budgetMs: 15_000, phase: 'ref domain fetch' },
              fetchScope => (options.fetchDomain ?? fetchDomainHtml)(url,
                AbortSignal.any([scope.signal, fetchScope.signal, ...(parentScope ? [parentScope.signal] : [])])));
          } catch (error) {
            if (!(error instanceof AcquisitionTimeoutError) || scope.signal.aborted || parentScope?.signal.aborted) throw error;
            fetched = { kind: 'fallback' as const, reason: 'static fetch exceeded 15-second budget' };
          }
          scope.assertLive(); parentScope?.assertLive();
          if (fetched.kind === 'fallback') return userBrowser ? acquireUserBrowser(scope)
            : withBrowser(browser => captureReferenceNavigation(browser, url, 'domain', writer,
              entry as 'public-directory' | undefined, scope, config, false), scope,
              { reference: true, config, ...(options.browserConnector ? { connector: options.browserConnector } : {}) });
          const observation = fetched.observation;
          if (entry !== undefined) validateDirectDiscoveryLinks(entry, { url, finalUrl: fetched.finalUrl, links: observation.links });
          const unsigned = { schema: DOMAIN_OBSERVATION_SCHEMA, source: url, researchLane: 'domain' as const,
            method: entry === undefined ? 'navigation' as const : 'direct-public' as const,
            entry: entry === undefined ? null : 'public-directory' as const, capturedAt: new Date().toISOString(),
            acquisition: { requestedUrl: url, finalUrl: fetched.finalUrl, httpStatus: fetched.status, links: observation.links },
            observedText: observation.observedText, taskText: observation.taskText, linkLabels: observation.linkLabels,
            language: classifyKoreanServiceText(observation.observedText), limitations: DOMAIN_STATIC_FETCH_LIMITATIONS } as const;
          const record: DomainObservationRecord = { ...unsigned, signature: signNativeObservation(writer.projectRoot,
            DOMAIN_OBSERVATION_SCHEMA, discoveryDigest(canonicalJson(unsigned))) };
          const bytes = `${JSON.stringify(record, null, 2)}\n`; const sha256 = discoveryDigest(bytes);
          const capture = { path: `.omd/discovery/domain/observations/${sha256}.json`, sha256 };
          scope.assertLive(); parentScope?.assertLive();
          writer.writeContentAddressed(capture.path, bytes);
          return { url, capture };
        });
        return result;
      } catch (error) {
        if (parentScope?.signal.aborted) throw error;
        const attempt = publishFailedAttempt(writer, url, lane, entry, null, error, userBrowser ? 'user-browser' : undefined);
        throw new ReferenceNavigationError(error instanceof Error ? error.message : 'domain fetch failed', attempt);
      }
    },
    async close(): Promise<void> { /* Each transport owns and closes its resources per navigation. */ },
  };
}

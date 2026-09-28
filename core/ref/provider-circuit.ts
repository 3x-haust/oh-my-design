import { designDiscoveryDirectoryProvider, designDiscoveryProvider } from './design-discovery-sources.ts';
import type { LaneEvidence } from './discovery-evidence.ts';

export type ProviderCircuitSummary = Readonly<{ code: 'REFERENCE_PROVIDER_CIRCUIT_OPEN'; provider: string;
  threshold: 2; receipts: readonly Readonly<{ path: string; sha256: string }>[] }>;
export function discoveryProvider(url: string): string | null {
  return designDiscoveryProvider(url) ?? designDiscoveryDirectoryProvider(url);
}
/** A tripped provider remains open for this route publication even if later captures exist. */
export function providerCircuitSummaries(evidence: LaneEvidence): readonly ProviderCircuitSummary[] {
  const events = [
    ...evidence.attemptReceipts.flatMap(({ attempt, receipt }) => {
      const provider = discoveryProvider(attempt.source);
      // Challenge is recorded only after the acquisition layer's solve attempt failed.
      return provider ? [{ provider, time: Date.parse(attempt.capturedAt), receipt, success: false }] : [];
    }),
    ...[...evidence.entries, ...evidence.visits].flatMap(capture => {
      const provider = discoveryProvider(capture.observation.url);
      return provider && capture.observation.capturedAt
        ? [{ provider, time: Date.parse(capture.observation.capturedAt), receipt: capture.receipt, success: true }] : [];
    }),
  ].sort((a, b) => a.time - b.time || a.receipt.path.localeCompare(b.receipt.path));
  const streak = new Map<string, typeof events>();
  const open = new Map<string, ProviderCircuitSummary>();
  for (const event of events) {
    if (open.has(event.provider)) continue;
    if (event.success) { streak.delete(event.provider); continue; }
    const failures = [...(streak.get(event.provider) ?? []), event];
    streak.set(event.provider, failures);
    if (failures.length >= 2) open.set(event.provider, { code: 'REFERENCE_PROVIDER_CIRCUIT_OPEN', provider: event.provider,
      threshold: 2, receipts: failures.slice(-2).map(item => item.receipt) });
  }
  return [...open.values()];
}

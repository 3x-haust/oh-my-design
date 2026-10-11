export const USER_BROWSER_LIMITATIONS = 'user-browser-session; initial-and-observed-url-public-check-only; browser-redirects-subresources-and-dns-not-isolated; get-only-not-enforced; uncertain-text-excluded; no-interaction-motion-or-energy-probes; not-provider-attested' as const;
export const USER_BROWSER_PROVENANCE = { engine: 'user-browser', httpStatus: null, httpStatusSource: 'unobserved',
  authentication: 'user-browser-session', networkIsolation: 'initial-url-check-only', getOnlyEnforced: false } as const;

/** Nullable status is admissible only when the reduced-isolation provenance is complete. */
export function userBrowserAcquisition(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.engine === 'user-browser' && row.httpStatus === null && row.httpStatusSource === 'unobserved'
    && row.authentication === 'user-browser-session' && row.networkIsolation === 'initial-url-check-only'
    && row.getOnlyEnforced === false;
}

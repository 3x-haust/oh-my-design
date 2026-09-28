export type UserBrowserSession = Readonly<{
  navigate(url: string, options?: { waitUntil?: string; timeoutMs?: number }): Promise<unknown>;
  resize(width: number, height: number): Promise<unknown>;
  evaluate(expression: string, options?: { awaitPromise?: boolean; returnByValue?: boolean; timeoutMs?: number }): Promise<{ ok: boolean; value?: unknown; error?: unknown }>;
  screenshot(options: { fullPage: true } | Record<string, never>): Promise<{ buffer: Uint8Array; width: number; height: number; captureUnavailable?: boolean; format?: string }>;
  requestHelp(request: { prompt: string; title?: string; completionCriteria?: string; timeoutMs?: number }): Promise<{ outcome: string }>;
  stop(): Promise<void>;
}>;
export type UserBrowserCandidate = Readonly<{ id: string; label: string; signals: readonly string[] }>;
export type UserBrowserDoctorReport = Readonly<{
  state: 'ready' | 'bridge-not-installed' | 'bridge-not-running' | 'extension-not-connected' | 'choose-browser' | 'unsupported-browser' | 'driver-unavailable' | 'driver-incompatible';
  browser: { id: string; label: string } | null;
  candidates: readonly UserBrowserCandidate[];
  defaultBrowser: { label: string; supported: boolean } | null;
}>;
export type UserBrowserSetupResult = Readonly<{
  state: 'ready' | 'pending-human-step' | 'needs-browser-choice' | 'failed';
  humanStep: string | null;
  candidates: readonly UserBrowserCandidate[];
}>;
export type UserBrowserDriver = Readonly<{
  connectUserBrowserSession(options: { name: string; focused: false }): Promise<UserBrowserSession>;
  userBrowserBridgeDoctor(options: { waitForBrowserMs: 0; browser?: string }): Promise<any>;
  userBrowserBridgeOnboard(options: { browser?: string; waitForBrowserMs: 0; waitTotalMs: 0; onHumanStep: (step: string) => void }): Promise<any>;
}>;

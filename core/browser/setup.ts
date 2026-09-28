import { loadUserBrowserDriver, UserBrowserError } from './driver.ts';
import type { UserBrowserCandidate, UserBrowserDoctorReport, UserBrowserDriver, UserBrowserSetupResult } from './contracts.ts';

const candidates = (value: any): UserBrowserCandidate[] => Array.isArray(value) ? value.filter(x =>
  x && typeof x.id === 'string' && typeof x.label === 'string').map(x => ({ id: x.id, label: x.label,
    signals: Array.isArray(x.signals) ? x.signals.filter((s: unknown) => typeof s === 'string') : [] })) : [];
const humanInstruction = (value: unknown): string | null => typeof value === 'string'
  ? value : null;

/** Read-only: doctor must not install, launch, or start the bridge. */
export async function userBrowserDoctor(browser?: string, driver?: UserBrowserDriver): Promise<UserBrowserDoctorReport> {
  let runtime: UserBrowserDriver;
  try { runtime = driver ?? await loadUserBrowserDriver(); }
  catch (error) { return { state: error instanceof UserBrowserError && error.code === 'driver-incompatible'
    ? 'driver-incompatible' : 'driver-unavailable', browser: null, candidates: [], defaultBrowser: null }; }
  try {
    const report = await runtime.userBrowserBridgeDoctor({ waitForBrowserMs: 0, ...(browser ? { browser } : {}) });
    if (!report || typeof report.ready !== 'boolean' || !report.cli || !report.daemon || !report.identification)
      throw new UserBrowserError('driver-incompatible', 'invalid doctor report');
    const state: UserBrowserDoctorReport['state'] = report.ready ? 'ready' : !report.cli.installed ? 'bridge-not-installed'
      : !report.daemon.running ? 'bridge-not-running' : report.identification.needsChoice ? 'choose-browser'
        : !report.primary && (!Array.isArray(report.browsers) || report.browsers.length === 0)
          ? 'unsupported-browser' : 'extension-not-connected';
    return { state, browser: report.primary && typeof report.primary.id === 'string'
      ? { id: report.primary.id, label: report.primary.label } : null,
      candidates: candidates(report.identification.candidates),
      defaultBrowser: report.identification.defaultBrowser && typeof report.identification.defaultBrowser.supported === 'boolean'
        ? { label: report.identification.defaultBrowser.label, supported: report.identification.defaultBrowser.supported } : null };
  } catch (error) {
    return { state: error instanceof UserBrowserError && error.code === 'driver-incompatible'
      ? 'driver-incompatible' : 'driver-unavailable', browser: null, candidates: [], defaultBrowser: null };
  }
}

/** Consent is granted by the caller before invoking this side-effecting operation. */
export async function installUserBrowserBridge(browser?: string, driver?: UserBrowserDriver): Promise<UserBrowserSetupResult> {
  const runtime = driver ?? await loadUserBrowserDriver();
  const before = await userBrowserDoctor(browser, runtime);
  if (before.state === 'ready') return { state: 'ready', humanStep: null, candidates: before.candidates };
  if (before.state === 'choose-browser' || before.state === 'unsupported-browser' ||
    (before.defaultBrowser && !before.defaultBrowser.supported && !browser))
    return { state: 'needs-browser-choice', humanStep: null, candidates: before.candidates };
  const steps: string[] = [];
  try {
    const result = await runtime.userBrowserBridgeOnboard({ ...(browser ? { browser } : {}), waitForBrowserMs: 0, waitTotalMs: 0,
      onHumanStep: step => steps.push(step) });
    if (!result || typeof result.ready !== 'boolean') throw new Error('invalid setup result');
    if (result.needsChoice) return { state: 'needs-browser-choice', humanStep: null,
      candidates: candidates(result.identification?.candidates) };
    const after = await userBrowserDoctor(browser, runtime);
    return { state: after.state === 'ready' ? 'ready' : 'pending-human-step',
      humanStep: after.state === 'ready' ? null : humanInstruction(result.humanStep ?? steps.at(-1)), candidates: after.candidates };
  } catch { return { state: 'failed', humanStep: null, candidates: before.candidates }; }
}

// Multi-screen flow probe — plan validation (increment 1, additive and not yet browser-executed).
//
// `validateProbePlan` in ./index.ts validates a SINGLE-screen scenario: one `page.goto(url)` and a
// list of click/fill/press steps on that one page. A real app is a sequence of screens — login →
// onboarding → dashboard → settings — and the failures that hurt most are the ones that only appear
// ACROSS screens: a dead end (a screen with no declared way forward), and state loss (a value entered
// early that is gone by a later screen). Those were only an eye/advisory judgment. This is the
// verifiable contract for a multi-screen flow: an ordered, linear sequence of screens, each proving it
// actually loaded (an arrival expectation, so a broken transition is a dead end, not a silent pass),
// each non-terminal screen declaring how it advances to the next, and declared state that must survive
// forward across screens.
//
// It reuses ./index.ts's step and expectation validators verbatim, so a flow inherits the same security
// constraints as a single-screen probe (non-destructive, no credential fills, safe key allowlist). It
// is NOT yet wired into a browser executor or the evals — capture and wiring are later increments — so
// the existing single-screen probe is untouched.

import { validateProbeExpectation, validateProbeStep } from './index.ts';

export const PROBE_FLOW_SCHEMA = 'probe-flow-v1' as const;

/** A flow is a designed sequence, not an unbounded crawl. */
export const MAX_FLOW_SCREENS = 8;

export type ProbeScreen = {
  readonly screenId: string;
  /** Local production-reachable path, '/'-rooted. */
  readonly route: string;
  /** What must be present when this screen loads — proof the transition landed, not a dead end. */
  readonly arrival: readonly unknown[];
  /** click/fill/press steps on this screen (same vocabulary and security as a single-screen probe). */
  readonly steps: readonly unknown[];
  /** The next screenId this screen advances to; omitted only on the single terminal screen. */
  readonly advancesTo?: string;
};

/** A value present on an earlier screen that must still be present on a later screen. */
export type StateCarry = {
  readonly fromScreen: string;
  readonly fromLocator: string;
  readonly toScreen: string;
  readonly toLocator: string;
};

export type ProbeFlow = {
  readonly schema: typeof PROBE_FLOW_SCHEMA;
  readonly name: string;
  readonly destructive: false;
  readonly screens: readonly ProbeScreen[];
  readonly carries: readonly StateCarry[];
};

const fail = (reason: string): never => { throw new Error(`probe flow is invalid: ${reason}`); };
const nonEmpty = (v: unknown, reason: string): string => (typeof v === 'string' && v.trim() !== '' ? v : fail(reason));
const object = (v: unknown, reason: string): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(reason);
const closedKeys = (record: Record<string, unknown>, allowed: readonly string[], reason: string): void => {
  if (Object.keys(record).some((key) => !allowed.includes(key))) fail(reason);
};

/** A safe, local, production-reachable route: '/'-rooted, no scheme, no traversal, no backslash. */
function safeRoute(value: unknown, reason: string): string {
  const route = nonEmpty(value, reason);
  if (!route.startsWith('/') || /^[a-z]+:\/\//i.test(route) || route.includes('\0') || route.includes('\\')) {
    fail(`${reason} — must be a local '/'-rooted path`);
  }
  if (route.split('/').some((part) => part === '..' || part === '.')) fail(`${reason} — must not contain path traversal`);
  return route;
}

/**
 * Validates a multi-screen flow plan. Throws on any violation. A flow is valid only as a non-destructive,
 * linear sequence of 2..MAX_FLOW_SCREENS screens with unique ids; each screen carries a safe local route,
 * a non-empty arrival expectation, and steps that satisfy the single-screen step/security contract; every
 * non-terminal screen advances to the next screen in order and has at least one step to advance with
 * (a screen that declares no way forward is a dead end); exactly one terminal screen (the last) advances
 * nowhere; and every declared state carry moves a value strictly forward from an earlier to a later screen.
 */
export function validateProbeFlow(input: unknown): ProbeFlow {
  const raw = object(input, 'flow must be an object');
  closedKeys(raw, ['schema', 'name', 'destructive', 'screens', 'carries'], 'flow has unknown or missing keys');
  if (raw['schema'] !== PROBE_FLOW_SCHEMA) fail(`schema must be ${PROBE_FLOW_SCHEMA}`);
  nonEmpty(raw['name'], 'name is required');
  if (raw['destructive'] !== false) fail('a flow probe is never destructive');

  const screens: unknown[] = Array.isArray(raw['screens']) ? raw['screens'] : fail('screens must be an array');
  if (screens.length < 2) fail('a flow needs at least two screens — a single screen is the existing single-screen probe');
  if (screens.length > MAX_FLOW_SCREENS) fail(`a flow is bounded to ${MAX_FLOW_SCREENS} screens`);

  const ids: string[] = [];
  for (let index = 0; index < screens.length; index += 1) {
    const screen = object(screens[index], `screens[${index}] must be an object`);
    closedKeys(screen, ['screenId', 'route', 'arrival', 'steps', 'advancesTo'], `screens[${index}] has unknown or missing keys`);
    const screenId = nonEmpty(screen['screenId'], `screens[${index}].screenId is required`);
    if (ids.includes(screenId)) fail(`duplicate screenId: ${screenId}`);
    ids.push(screenId);
    safeRoute(screen['route'], `screens[${index}].route is invalid`);
    const arrival: unknown[] = Array.isArray(screen['arrival']) && screen['arrival'].length > 0
      ? screen['arrival']
      : fail(`screens[${index}].arrival must be a non-empty expectation list (it proves the transition landed)`);
    for (const exp of arrival) validateProbeExpectation(exp);
    const steps: unknown[] = Array.isArray(screen['steps']) ? screen['steps'] : fail(`screens[${index}].steps must be an array`);
    for (const step of steps) validateProbeStep(step);
  }

  // Linear reachability + dead-end structure: each non-terminal screen advances to the next screen in
  // order and must have a step to advance with; exactly the last screen is terminal.
  for (let index = 0; index < screens.length; index += 1) {
    const screen = screens[index] as Record<string, unknown>;
    const isTerminal = index === screens.length - 1;
    const advancesTo = screen['advancesTo'];
    if (isTerminal) {
      if (advancesTo !== undefined) fail(`the terminal screen (${ids[index]}) advances nowhere; remove advancesTo`);
    } else {
      const next = ids[index + 1];
      if (advancesTo !== next) fail(`screens[${index}] (${ids[index]}) is a dead end — advancesTo must be the next screen '${next}'`);
      if ((screen['steps'] as unknown[]).length === 0) fail(`screens[${index}] (${ids[index]}) advances to '${next}' but has no step to advance with`);
    }
  }

  const carries: unknown[] = Array.isArray(raw['carries']) ? raw['carries'] : fail('carries must be an array');
  const order = new Map(ids.map((id, index) => [id, index]));
  for (let index = 0; index < carries.length; index += 1) {
    const carry = object(carries[index], `carries[${index}] must be an object`);
    closedKeys(carry, ['fromScreen', 'fromLocator', 'toScreen', 'toLocator'], `carries[${index}] has unknown or missing keys`);
    const fromScreen = nonEmpty(carry['fromScreen'], `carries[${index}].fromScreen is required`);
    const toScreen = nonEmpty(carry['toScreen'], `carries[${index}].toScreen is required`);
    nonEmpty(carry['fromLocator'], `carries[${index}].fromLocator is required`);
    nonEmpty(carry['toLocator'], `carries[${index}].toLocator is required`);
    const fromIndex = order.get(fromScreen);
    const toIndex = order.get(toScreen);
    if (fromIndex === undefined) fail(`carries[${index}].fromScreen references unknown screen '${fromScreen}'`);
    if (toIndex === undefined) fail(`carries[${index}].toScreen references unknown screen '${toScreen}'`);
    if ((toIndex as number) <= (fromIndex as number)) fail(`carries[${index}] must carry state forward: '${toScreen}' must come after '${fromScreen}'`);
  }

  return input as ProbeFlow;
}

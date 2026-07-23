import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_FLOW_SCREENS, PROBE_FLOW_SCHEMA, validateProbeFlow } from '../core/probe/flow.ts';

const screen = (over: Record<string, unknown> = {}) => ({
  screenId: 'login',
  route: '/login',
  arrival: [{ type: 'visible', selector: '#login-form' }],
  steps: [{ action: 'click', selector: '#continue', expect: [{ type: 'url', value: '/dashboard' }] }],
  advancesTo: 'dashboard',
  ...over,
});

const flow = (over: Record<string, unknown> = {}) => ({
  schema: PROBE_FLOW_SCHEMA,
  name: 'onboarding flow',
  destructive: false as const,
  screens: [
    screen({ screenId: 'login', route: '/login', advancesTo: 'dashboard', steps: [
      { action: 'fill', selector: '#email', value: 'a@b.com', expect: [{ type: 'attribute', selector: '#email', name: 'value', value: 'a@b.com' }] },
      { action: 'click', selector: '#continue', expect: [{ type: 'url', value: '/dashboard' }] },
    ], arrival: [{ type: 'visible', selector: '#login-form' }] }),
    screen({ screenId: 'dashboard', route: '/dashboard', advancesTo: 'settings',
      arrival: [{ type: 'visible', selector: '[data-region="dashboard"]' }],
      steps: [{ action: 'click', selector: '#open-settings', expect: [{ type: 'url', value: '/settings' }] }] }),
    { screenId: 'settings', route: '/settings', arrival: [{ type: 'visible', selector: '#settings' }], steps: [] },
  ],
  carries: [{ fromScreen: 'login', fromLocator: '#email', toScreen: 'settings', toLocator: '#account-email' }],
  ...over,
});

test('a linear multi-screen flow with arrivals, advances, and a forward state carry validates', () => {
  const valid = flow();
  assert.deepEqual(validateProbeFlow(valid), valid);
});

test('a flow is a bounded sequence of at least two screens', () => {
  assert.throws(() => validateProbeFlow({ ...flow(), screens: [flow().screens[0]] }), /at least two screens/);
  const many = Array.from({ length: MAX_FLOW_SCREENS + 1 }, (_u, i) => ({
    screenId: `s${i}`, route: `/s${i}`, arrival: [{ type: 'visible', selector: '#x' }],
    steps: i === MAX_FLOW_SCREENS ? [] : [{ action: 'click', selector: '#n', expect: [{ type: 'visible', selector: '#x' }] }],
    ...(i === MAX_FLOW_SCREENS ? {} : { advancesTo: `s${i + 1}` }),
  }));
  assert.throws(() => validateProbeFlow({ ...flow(), screens: many, carries: [] }), new RegExp(`bounded to ${MAX_FLOW_SCREENS} screens`));
});

test('a non-terminal screen that advances nowhere, or to the wrong screen, is a dead end', () => {
  const noAdvance = flow();
  delete (noAdvance.screens[1] as Record<string, unknown>).advancesTo;
  assert.throws(() => validateProbeFlow(noAdvance), /dead end/);
  const wrongAdvance = flow();
  (wrongAdvance.screens[0] as Record<string, unknown>).advancesTo = 'settings';
  assert.throws(() => validateProbeFlow(wrongAdvance), /dead end[\s\S]*next screen 'dashboard'/);
  const noStep = flow();
  (noStep.screens[1] as Record<string, unknown>).steps = [];
  assert.throws(() => validateProbeFlow(noStep), /no step to advance with/);
  const terminalAdvances = flow();
  (terminalAdvances.screens[2] as Record<string, unknown>).advancesTo = 'login';
  assert.throws(() => validateProbeFlow(terminalAdvances), /terminal screen[\s\S]*advances nowhere/);
});

test('every screen must prove it loaded (a non-empty arrival) and use a safe local route', () => {
  const noArrival = flow();
  (noArrival.screens[1] as Record<string, unknown>).arrival = [];
  assert.throws(() => validateProbeFlow(noArrival), /arrival must be a non-empty expectation list/);
  for (const bad of ['dashboard', 'https://evil.example/x', '/../secret', '/a\\b']) {
    const r = flow();
    (r.screens[1] as Record<string, unknown>).route = bad;
    assert.throws(() => validateProbeFlow(r), /route/);
  }
});

test('a flow inherits the single-screen security contract (no credential fills, closed shapes)', () => {
  const credential = flow();
  (credential.screens[0] as Record<string, unknown>).steps = [
    { action: 'fill', selector: '#password', value: 'hunter2', expect: [{ type: 'visible', selector: '#ok' }] },
    { action: 'click', selector: '#continue', expect: [{ type: 'url', value: '/dashboard' }] },
  ];
  assert.throws(() => validateProbeFlow(credential), /credential/);
  assert.throws(() => validateProbeFlow({ ...flow(), extra: 1 }), /unknown or missing keys/);
  assert.throws(() => validateProbeFlow({ ...flow(), schema: 'nope' }), /schema must be/);
  assert.throws(() => validateProbeFlow({ ...flow(), destructive: true }), /never destructive/);
});

test('a state carry must move a value strictly forward and reference real screens', () => {
  const backward = flow();
  backward.carries = [{ fromScreen: 'settings', fromLocator: '#a', toScreen: 'login', toLocator: '#b' }];
  assert.throws(() => validateProbeFlow(backward), /carry state forward/);
  const unknown = flow();
  unknown.carries = [{ fromScreen: 'login', fromLocator: '#a', toScreen: 'nope', toLocator: '#b' }];
  assert.throws(() => validateProbeFlow(unknown), /unknown screen 'nope'/);
  const dupe = flow();
  dupe.screens[1] = { ...(dupe.screens[1] as Record<string, unknown>), screenId: 'login' } as never;
  assert.throws(() => validateProbeFlow(dupe), /duplicate screenId: login/);
});

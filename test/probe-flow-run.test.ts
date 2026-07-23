import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runProbeFlow, PROBE_FLOW_SCHEMA } from '../core/probe/flow.ts';

// A three-screen fixture: login → dashboard → settings, carrying the entered email forward through the
// URL (file:// localStorage is per-file-origin, so a query param is the portable carrier). The DOM
// values are what the flow compares; the carrier is incidental.
function writeFlowFixture(dir: string, opts: { brokenContinue?: boolean; brokenSettings?: boolean } = {}): void {
  writeFileSync(join(dir, 'login.html'), `<!doctype html><html><body>
    <form id="login-form"><input id="email" /></form>
    <button id="continue" type="button">Continue</button>
    <script>document.getElementById('continue').addEventListener('click', function(){
      ${opts.brokenContinue ? '/* dead end: this control leads nowhere */' : "location.href = 'dashboard.html?email=' + encodeURIComponent(document.getElementById('email').value);"}
    });</script>
  </body></html>`);
  writeFileSync(join(dir, 'dashboard.html'), `<!doctype html><html><body>
    <div data-region="dashboard">Dashboard</div>
    <a id="open-settings" href="settings.html">Open settings</a>
    <script>document.getElementById('open-settings').addEventListener('click', function(e){ e.preventDefault(); location.href = 'settings.html' + location.search; });</script>
  </body></html>`);
  writeFileSync(join(dir, 'settings.html'), `<!doctype html><html><body>
    <div id="settings"><input id="account-email" /></div>
    <script>document.getElementById('account-email').value = ${opts.brokenSettings ? "''" : "new URLSearchParams(location.search).get('email') || ''"};</script>
  </body></html>`);
}

const flowPlan = () => ({
  schema: PROBE_FLOW_SCHEMA,
  name: 'onboarding',
  destructive: false as const,
  screens: [
    { screenId: 'login', route: '/login', arrival: [{ type: 'visible', selector: '#login-form' }],
      steps: [
        { action: 'fill', selector: '#email', value: 'user@example.com', expect: [{ type: 'attribute', selector: '#email', name: 'value', value: 'user@example.com' }] },
        { action: 'click', selector: '#continue', expect: [{ type: 'url', value: 'dashboard' }] },
      ], advancesTo: 'dashboard' },
    { screenId: 'dashboard', route: '/dashboard', arrival: [{ type: 'visible', selector: '[data-region="dashboard"]' }],
      steps: [{ action: 'click', selector: '#open-settings', expect: [{ type: 'url', value: 'settings' }] }], advancesTo: 'settings' },
    { screenId: 'settings', route: '/settings', arrival: [{ type: 'visible', selector: '#settings' }], steps: [] },
  ],
  carries: [{ fromScreen: 'login', fromLocator: '#email', toScreen: 'settings', toLocator: '#account-email' }],
});

test('a healthy flow reaches every screen and carries the entered value forward', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-flow-'));
  writeFlowFixture(dir);
  const result = await runProbeFlow(dir, flowPlan());
  assert.equal(result.schema, PROBE_FLOW_SCHEMA);
  assert.equal(result.screens.length, 3);
  assert.ok(result.screens.every((s) => s.arrivalOk), 'every screen was reached');
  assert.equal(result.carries.length, 1);
  assert.equal(result.carries[0]!.preserved, true);
  assert.deepEqual(result.carries[0]!.observed, { from: 'user@example.com', to: 'user@example.com' });
  assert.deepEqual(result.warnings, []);
});

test('a control that leads nowhere is reported as a dead end and stops the flow', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-flow-deadend-'));
  writeFlowFixture(dir, { brokenContinue: true });
  const result = await runProbeFlow(dir, flowPlan());
  assert.equal(result.screens[0]!.arrivalOk, true, 'login itself is reached');
  assert.equal(result.screens.length, 2, 'the flow stops at the unreached screen');
  assert.equal(result.screens[1]!.arrivalOk, false, 'dashboard was never reached');
  assert.ok(result.warnings.some((w) => w.id === 'FLOW-DEAD-END'), 'a dead end is reported');
});

test('a value that does not survive to a later screen is reported as state loss', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-flow-loss-'));
  writeFlowFixture(dir, { brokenSettings: true });
  const result = await runProbeFlow(dir, flowPlan());
  assert.ok(result.screens.every((s) => s.arrivalOk), 'no dead end — every screen is reachable');
  assert.equal(result.carries[0]!.preserved, false, 'the carried value was lost');
  assert.equal(result.carries[0]!.observed.from, 'user@example.com');
  assert.ok(result.warnings.some((w) => w.id === 'FLOW-STATE-LOSS'), 'state loss is reported');
});

test('the executor validates and refuses an unsafe flow before launching a browser', async () => {
  await assert.rejects(() => runProbeFlow('/nowhere', { schema: PROBE_FLOW_SCHEMA, name: 'x', destructive: false, screens: [], carries: [] }), /at least two screens/);
});

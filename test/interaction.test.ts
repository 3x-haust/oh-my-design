import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateIdeationGate, ingestInteractionSignal, type IdeationGateInputs } from '../core/interaction/index.ts';

test('ingestInteractionSignal accepts measurements and principles', () => {
  const result = ingestInteractionSignal({
    source: 'stripe.com/pricing',
    measurements: { hoverLatencyMs: 120, easingDurationMs: 240 },
    principles: ['reduced-motion-safe', 'hover-affordance'],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.entry.kind, 'interaction-signal');
  assert.equal(result.entry.source, 'stripe.com/pricing');
  assert.deepEqual(result.entry.measurements, { hoverLatencyMs: 120, easingDurationMs: 240 });
  assert.deepEqual(result.entry.principles, ['reduced-motion-safe', 'hover-affordance']);
  assert.ok(result.entry.id.length > 0);
});

test('ingestInteractionSignal rejects screenshot field', () => {
  const withScreenshot = {
    source: 'stripe.com/pricing',
    measurements: { hoverLatencyMs: 120 },
    principles: [],
    screenshot: 'data:image/png;base64,AAAA',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const result = ingestInteractionSignal(withScreenshot);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /screenshot rejected/);
});

test('ingestInteractionSignal rejects empty source', () => {
  const result = ingestInteractionSignal({ source: '', measurements: { x: 1 }, principles: [] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /source is required/);
});

test('ingestInteractionSignal rejects entries with no measurements and no principles', () => {
  const result = ingestInteractionSignal({ source: 'example.com', measurements: {}, principles: [] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /at least one measurement or principle/);
});

function fullGate(): IdeationGateInputs {
  return {
    registerFit: true,
    perfBudgetDeclared: true,
    slopClean: true,
    handPrecedence: true,
    semanticFallbackPresent: true,
  };
}

test('evaluateIdeationGate permits when every gate is satisfied', () => {
  const result = evaluateIdeationGate(fullGate());
  assert.deepEqual(result, { permitted: true, reasons: [] });
});

test('evaluateIdeationGate denies and reports reason when registerFit fails', () => {
  const result = evaluateIdeationGate({ ...fullGate(), registerFit: false });
  assert.equal(result.permitted, false);
  assert.deepEqual(result.reasons, ['register-fit not satisfied']);
});

test('evaluateIdeationGate denies and reports reason when perfBudgetDeclared fails', () => {
  const result = evaluateIdeationGate({ ...fullGate(), perfBudgetDeclared: false });
  assert.equal(result.permitted, false);
  assert.deepEqual(result.reasons, ['performance budget not declared']);
});

test('evaluateIdeationGate denies and reports reason when slopClean fails', () => {
  const result = evaluateIdeationGate({ ...fullGate(), slopClean: false });
  assert.equal(result.permitted, false);
  assert.deepEqual(result.reasons, ['slop check failed']);
});

test('evaluateIdeationGate denies and reports reason when handPrecedence fails', () => {
  const result = evaluateIdeationGate({ ...fullGate(), handPrecedence: false });
  assert.equal(result.permitted, false);
  assert.deepEqual(result.reasons, ['hand precedence not honored']);
});

test('evaluateIdeationGate denies and reports reason when semanticFallbackPresent fails', () => {
  const result = evaluateIdeationGate({ ...fullGate(), semanticFallbackPresent: false });
  assert.equal(result.permitted, false);
  assert.deepEqual(result.reasons, ['non-canvas semantic fallback missing']);
});

test('evaluateIdeationGate accumulates all failing reasons', () => {
  const result = evaluateIdeationGate({
    registerFit: false,
    perfBudgetDeclared: false,
    slopClean: true,
    handPrecedence: true,
    semanticFallbackPresent: true,
  });
  assert.equal(result.permitted, false);
  assert.deepEqual(result.reasons, ['register-fit not satisfied', 'performance budget not declared']);
});

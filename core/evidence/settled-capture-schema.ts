export const SETTLED_CAPTURE_SCHEMA = 'settled-capture-receipt-v1' as const;

export type CaptureRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type CaptureArtifact = Readonly<{ path: string; sha256: string }>;
export type CaptureWitness = Readonly<{
  selector: string;
  computed: Readonly<{
    display: string;
    visibility: string;
    opacity: number;
    rect: CaptureRect;
    textLength: number;
  }>;
  maskedScreenshot: CaptureArtifact;
}>;

export type SettledCaptureReceipt = Readonly<{
  schema: typeof SETTLED_CAPTURE_SCHEMA;
  screenshot: CaptureArtifact & Readonly<{
    mode: 'fixed-viewport';
    viewport: Readonly<{ width: number; height: number }>;
    deviceScaleFactor: 1;
    order: 4;
  }>;
  transition: Readonly<{
    trigger: Readonly<{
      kind: 'navigation' | 'click' | 'fill' | 'submit' | 'press';
      selector: string;
      order: 1;
    }>;
    signal: Readonly<{
      kind: 'dom';
      selector: string;
      predicate: 'attached-visible' | 'focused-visible' | 'attribute-equals' | 'text-includes';
      expected: string | null;
      subscribedOrder: 0;
      observedOrder: 2;
    }>;
  }>;
  settlement: Readonly<{
    order: 3;
    rafCommitsBeforeAnimations: 2;
    finiteAnimations: Readonly<{ observed: number; settled: number; pending: 0 }>;
    rafCommitsAfterAnimations: 2;
    pendingAnimationFrameCallbacks: 0;
  }>;
  primary: CaptureWitness;
  target: CaptureWitness;
  skipLinks: readonly Readonly<CaptureWitness & { focused: boolean }>[];
}>;

type JsonRecord = Record<string, unknown>;
const HEX = /^[0-9a-f]{64}$/;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonRecord;
}

function exact(value: unknown, keys: readonly string[], label: string): JsonRecord {
  const data = record(value, label);
  const actual = Object.keys(data).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys must be exactly ${expected.join(', ')}`);
  }
  return data;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function artifact(value: unknown, label: string): CaptureArtifact {
  const data = exact(value, ['path', 'sha256'], label);
  const sha256 = text(data.sha256, `${label}.sha256`);
  if (!HEX.test(sha256)) throw new Error(`${label}.sha256 must be lowercase SHA-256`);
  return { path: text(data.path, `${label}.path`), sha256 };
}

function rect(value: unknown, label: string): CaptureRect {
  const data = exact(value, ['x', 'y', 'width', 'height'], label);
  return {
    x: number(data.x, `${label}.x`),
    y: number(data.y, `${label}.y`),
    width: number(data.width, `${label}.width`),
    height: number(data.height, `${label}.height`),
  };
}

function witness(value: unknown, label: string): CaptureWitness {
  const data = exact(value, ['selector', 'computed', 'maskedScreenshot'], label);
  const computed = exact(data.computed, ['display', 'visibility', 'opacity', 'rect', 'textLength'], `${label}.computed`);
  return {
    selector: text(data.selector, `${label}.selector`),
    computed: {
      display: text(computed.display, `${label}.computed.display`),
      visibility: text(computed.visibility, `${label}.computed.visibility`),
      opacity: number(computed.opacity, `${label}.computed.opacity`),
      rect: rect(computed.rect, `${label}.computed.rect`),
      textLength: number(computed.textLength, `${label}.computed.textLength`),
    },
    maskedScreenshot: artifact(data.maskedScreenshot, `${label}.maskedScreenshot`),
  };
}

export function parseSettledCaptureReceipt(value: unknown): SettledCaptureReceipt {
  const data = exact(value, ['schema', 'screenshot', 'transition', 'settlement', 'primary', 'target', 'skipLinks'], 'receipt');
  if (data.schema !== SETTLED_CAPTURE_SCHEMA) throw new Error(`schema must be ${SETTLED_CAPTURE_SCHEMA}`);
  const shot = exact(data.screenshot, ['path', 'sha256', 'mode', 'viewport', 'deviceScaleFactor', 'order'], 'screenshot');
  const viewport = exact(shot.viewport, ['width', 'height'], 'screenshot.viewport');
  const transition = exact(data.transition, ['trigger', 'signal'], 'transition');
  const trigger = exact(transition.trigger, ['kind', 'selector', 'order'], 'transition.trigger');
  const signal = exact(transition.signal, ['kind', 'selector', 'predicate', 'expected', 'subscribedOrder', 'observedOrder'], 'transition.signal');
  const settlement = exact(data.settlement, ['order', 'rafCommitsBeforeAnimations', 'finiteAnimations', 'rafCommitsAfterAnimations', 'pendingAnimationFrameCallbacks'], 'settlement');
  const animations = exact(settlement.finiteAnimations, ['observed', 'settled', 'pending'], 'settlement.finiteAnimations');
  if (!Array.isArray(data.skipLinks)) throw new Error('skipLinks must be an array');
  const skipLinks = data.skipLinks.map((value, index) => {
    const item = exact(value, ['selector', 'focused', 'computed', 'maskedScreenshot'], `skipLinks[${index}]`);
    if (typeof item.focused !== 'boolean') throw new Error(`skipLinks[${index}].focused must be boolean`);
    return { ...witness({ selector: item.selector, computed: item.computed, maskedScreenshot: item.maskedScreenshot }, `skipLinks[${index}]`), focused: item.focused };
  });
  return {
    schema: SETTLED_CAPTURE_SCHEMA,
    screenshot: {
      ...artifact({ path: shot.path, sha256: shot.sha256 }, 'screenshot'),
      mode: shot.mode as 'fixed-viewport',
      viewport: { width: number(viewport.width, 'viewport.width'), height: number(viewport.height, 'viewport.height') },
      deviceScaleFactor: number(shot.deviceScaleFactor, 'deviceScaleFactor') as 1,
      order: number(shot.order, 'screenshot.order') as 4,
    },
    transition: {
      trigger: {
        kind: text(trigger.kind, 'trigger.kind') as SettledCaptureReceipt['transition']['trigger']['kind'],
        selector: text(trigger.selector, 'trigger.selector'),
        order: number(trigger.order, 'trigger.order') as 1,
      },
      signal: {
        kind: text(signal.kind, 'signal.kind') as 'dom',
        selector: text(signal.selector, 'signal.selector'),
        predicate: text(signal.predicate, 'signal.predicate') as SettledCaptureReceipt['transition']['signal']['predicate'],
        expected: signal.expected === null ? null : text(signal.expected, 'signal.expected'),
        subscribedOrder: number(signal.subscribedOrder, 'signal.subscribedOrder') as 0,
        observedOrder: number(signal.observedOrder, 'signal.observedOrder') as 2,
      },
    },
    settlement: {
      order: number(settlement.order, 'settlement.order') as 3,
      rafCommitsBeforeAnimations: number(settlement.rafCommitsBeforeAnimations, 'settlement.rafCommitsBeforeAnimations') as 2,
      finiteAnimations: {
        observed: number(animations.observed, 'animations.observed'),
        settled: number(animations.settled, 'animations.settled'),
        pending: number(animations.pending, 'animations.pending') as 0,
      },
      rafCommitsAfterAnimations: number(settlement.rafCommitsAfterAnimations, 'settlement.rafCommitsAfterAnimations') as 2,
      pendingAnimationFrameCallbacks: number(settlement.pendingAnimationFrameCallbacks, 'settlement.pendingAnimationFrameCallbacks') as 0,
    },
    primary: witness(data.primary, 'primary'),
    target: witness(data.target, 'target'),
    skipLinks,
  };
}

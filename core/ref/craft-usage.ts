// Machine gate for the "captured role-② craft declined to stillness" under-reach.
//
// The human-design-loop GREEN target says: when the scout captured role-② craft references with real
// measured scroll motion for a persuasion surface, the build must reproduce at least one scroll-linked
// reveal — declining every one to ship a static page is under-reach (RED). This module makes that
// checkable rather than eye-advisory. It reads the captured reference signatures (`.omd/refs/*.json`),
// asks whether any prove scroll-linked craft is this domain's norm, and — paired with a measured
// `reference-craft-v1` of the BUILT page (`captureReferenceCraft`) — flags a persuasion surface that
// captured scroll craft yet shipped static.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** A ref counts as scroll-craft evidence when its animated share alone clears this, even absent choreography. */
export const CRAFT_ANIMATED_SHARE_FLOOR = 0.08;

/** Surfaces whose correct risk is functional; captured scroll craft is not required of them. */
export const EXEMPT_SURFACES: ReadonlySet<string> = new Set(['product', 'quiet']);

export type CraftRefSignal = {
  readonly source: string;
  /** Any captured scroll-choreography step actually fired on scroll entry. */
  readonly scrollFired: boolean;
  /** Fraction of the captured subtree that is animated (0..1). */
  readonly animatedShare: number;
  /** Peak measured motion energy of the capture (0..1). */
  readonly peakEnergy: number;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Extracts the scroll-craft signal from one parsed reference record (tolerant of missing fields). */
export function refCraftSignal(ref: unknown, source: string): CraftRefSignal {
  const record = ref && typeof ref === 'object' ? (ref as Record<string, unknown>) : {};
  const invariants = record.invariants && typeof record.invariants === 'object' ? (record.invariants as Record<string, unknown>) : {};
  const choreo = Array.isArray(invariants.scrollChoreography) ? (invariants.scrollChoreography as Array<Record<string, unknown>>) : [];
  const scrollFired = choreo.some((step) => num(step.fired) > 0);
  const animatedShare = num(invariants.animatedShare);
  const energy = record.energyCurve && typeof record.energyCurve === 'object' ? (record.energyCurve as Record<string, unknown>) : {};
  const peakEnergy = num(energy.peakEnergy);
  return { source, scrollFired, animatedShare, peakEnergy };
}

/** Reads every `.omd/refs/*.json` and returns each reference's scroll-craft signal. */
export function readCapturedCraftSignals(refsDir: string): CraftRefSignal[] {
  if (!existsSync(refsDir)) return [];
  const signals: CraftRefSignal[] = [];
  for (const name of readdirSync(refsDir)) {
    if (!name.endsWith('.json')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(refsDir, name), 'utf8'));
    } catch {
      continue;
    }
    const source = parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).source === 'string'
      ? ((parsed as Record<string, unknown>).source as string)
      : name;
    signals.push(refCraftSignal(parsed, source));
  }
  return signals;
}

/**
 * True when the captured references prove scroll-linked craft is this domain's register norm:
 * any reference fired scroll choreography, or clears the animated-share floor.
 */
export function hasCapturedScrollCraft(signals: readonly CraftRefSignal[]): boolean {
  return signals.some((s) => s.scrollFired || s.animatedShare >= CRAFT_ANIMATED_SHARE_FLOOR);
}

export type CraftUsageFinding = {
  readonly id: 'CRAFT-DECLINED-TO-STILL';
  readonly message: string;
};

/**
 * Flags `CRAFT-DECLINED-TO-STILL` when a persuasion surface captured scroll-linked craft evidence but
 * the built page ships static. Returns null (ok) on an exempt (`product`/`quiet`) surface, when no
 * scroll craft was captured, or when the built page is itself scroll-linked.
 */
export function checkCraftUsage(opts: {
  readonly surface: string;
  readonly capturedScrollCraft: boolean;
  readonly builtScrollLinked: boolean;
}): CraftUsageFinding | null {
  if (EXEMPT_SURFACES.has(opts.surface)) return null;
  if (!opts.capturedScrollCraft) return null;
  if (opts.builtScrollLinked) return null;
  return {
    id: 'CRAFT-DECLINED-TO-STILL',
    message:
      'captured role-② references fire scroll-linked craft for this domain, but the built page ships static — the scroll craft was declined to stillness (under-reach, RED). Reproduce at least one scroll-linked reveal from the captured evidence and verify it with `omd craft-fidelity`, or record an explicit brief-driven reason for stillness.',
  };
}

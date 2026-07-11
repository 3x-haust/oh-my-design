import type { EnergyCurve, Ir, Violation } from '../types.ts';

// ── Motion spec parser ───────────────────────────────────────────────────────
//
// motion-spec.md format (written by omd-hand before the build):
//
//   ## Scene name
//   - trigger: load | scroll | hover
//   - target: .selector
//   - properties: opacity, transform
//   - duration: 400ms (ref: motion-study-1)
//   - easing: cubic-bezier(0.2,0,0,1)
//   - stagger: 40ms between .card siblings   ← optional
//
// The parser splits on ## headers, then looks for `trigger:` in each section.

type Trigger = 'load' | 'scroll' | 'hover' | 'unknown';

interface SpecScene {
  name: string;
  trigger: Trigger;
  hasStagger: boolean;
}

function parseMotionSpec(md: string): SpecScene[] {
  // Split on h2 headers; slice(1) discards any preamble before the first ##.
  const sections = md.split(/^##\s+/m).slice(1);
  const scenes: SpecScene[] = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const name = lines[0]?.trim() ?? '';
    if (!name) continue;

    let trigger: Trigger = 'unknown';
    const m = /(?:^|\s)trigger\s*:\s*(load|scroll|hover)/im.exec(section);
    if (m) trigger = m[1]!.toLowerCase() as 'load' | 'scroll' | 'hover';

    const hasStagger = /stagger/i.test(section);
    scenes.push({ name, trigger, hasStagger });
  }

  return scenes;
}

function isShowpiece(frameMd: string | null): boolean {
  if (!frameMd) return false;
  return /showpiece/i.test(frameMd);
}

// ── Rule implementations ─────────────────────────────────────────────────────
//
// MOTION-SPEC-DRIFT
//   Fires when the spec and the live probe disagree about whether motion exists:
//   (a) spec describes load/scroll scenes → probe detected nothing, OR
//   (b) probe detected animations → spec has no scenes.
//   Rationale: the spec is a contract ("build will contain exactly these animations");
//   a gap between spec and reality means either an unimplemented scene or an
//   undocumented animation.
//
//   GSAP note: getAnimations() cannot see rAF-driven motion (GSAP, Anime.js). A
//   GSAP-only page may legitimately appear as "probe detected nothing" even when the
//   filmstrip energy curve shows motion. When energyCurve is present and peakEnergy > 0,
//   it is used as a fallback signal for probe detection.
//
// MOTION-NO-ENTRANCE
//   Fires only when: (1) frame.md commits to showpiece register, AND (2) motion-spec
//   has at least one load-triggered scene, AND (3) neither the probe nor the energy
//   curve detected any entrance animation. Rationale: a showpiece page that promised
//   an entrance scene and delivered nothing is a broken contract between spec and build.
//
// MOTION-NO-STAGGER (dropped — unmeasurable with current probe data)
//   Plan v2 M5 specified: fires when spec names a stagger but probe start-times of
//   the scene's siblings are identical. DROPPED: the motion snapshots (t=0/500/1500ms)
//   record animation count, duration, easing, and properties — but NOT per-element start
//   times or delays. Without individual element start times there is no deterministic path
//   to distinguish simultaneous-fire from staggered-fire. Implement when per-element
//   start times become available from the probe.

/**
 * Compare `.omd/motion-spec.md` against live probe + energy data and return any
 * MOTION-SPEC-DRIFT or MOTION-NO-ENTRANCE violations.
 *
 * Only called when `.omd/motion-spec.md` exists (the caller guards that).
 *
 * @param ir           Normalized IR from the current check run, with ir.meta.motion
 *                     populated when the check ran against a live page target.
 * @param motionSpecMd Content of .omd/motion-spec.md.
 * @param frameMd      Content of .omd/frame.md, or null if absent.
 * @param energyCurve  Energy curve from .omd/.cache/*-energy.json, or null if absent.
 *                     Used as a fallback signal when getAnimations() cannot see the
 *                     motion library in use (e.g. GSAP).
 */
export function checkMotionSpec(
  ir: Ir,
  motionSpecMd: string,
  frameMd: string | null,
  energyCurve: EnergyCurve | null,
): Violation[] {
  const violations: Violation[] = [];
  const scenes = parseMotionSpec(motionSpecMd);

  // Probe data may be absent (pre-probe IRs, or check run without a live page target).
  // Skip all spec-vs-probe comparisons when it is: a ghost probe would produce false
  // positives against any spec.
  const motionProbe = ir.meta?.['motion'] as
    | {
        snapshots?: Array<{ t: number; animations: unknown[] }>;
        animatedProperties?: string[];
        scrollChoreography?: Array<{ step: number; fired: number; entered: number }>;
      }
    | null
    | undefined;

  if (!motionProbe) return violations;

  // ── Whether the probe/energy detected any motion ─────────────────────────

  const hasProbeAnimations = (motionProbe.animatedProperties?.length ?? 0) > 0;
  const hasScrollFired = (motionProbe.scrollChoreography ?? []).some((s) => s.fired > 0);
  // Energy > 0.5% pixel change: a negligible anti-alias flicker stays below this floor.
  const hasEnergyMotion = energyCurve !== null && energyCurve.peakEnergy > 0.005;
  const probeDetectedMotion = hasProbeAnimations || hasScrollFired || hasEnergyMotion;

  // ── MOTION-SPEC-DRIFT ────────────────────────────────────────────────────

  const loadScrollScenes = scenes.filter((s) => s.trigger === 'load' || s.trigger === 'scroll');

  if (loadScrollScenes.length > 0 && !probeDetectedMotion) {
    violations.push({
      id: 'MOTION-SPEC-DRIFT',
      severity: 'warn',
      layer: 1,
      category: 'motion',
      nodeId: 'page',
      path: 'motion-spec',
      value: `spec:${loadScrollScenes.length},probe:0`,
      message:
        `motion-spec.md describes ${loadScrollScenes.length} load/scroll scene`
        + `${loadScrollScenes.length === 1 ? '' : 's'} but the live probe detected no`
        + ` animations (getAnimations returned nothing; filmstrip energy also absent or zero).`
        + ` Either the scenes were not implemented, or they use GSAP/rAF which is invisible`
        + ` to getAnimations() — run \`omd render --filmstrip\` and check the energy curve.`,
    });
  }

  if (scenes.length === 0 && probeDetectedMotion) {
    violations.push({
      id: 'MOTION-SPEC-DRIFT',
      severity: 'warn',
      layer: 1,
      category: 'motion',
      nodeId: 'page',
      path: 'motion-spec',
      value: 'spec:0,probe:detected',
      message:
        'The live probe detected animations but motion-spec.md describes no scenes.'
        + ' Animations not in the spec were not planned — add a scene entry for every'
        + ' animation in the build, or remove the unplanned animations.',
    });
  }

  // ── MOTION-NO-ENTRANCE ───────────────────────────────────────────────────

  // Only fires when the page committed to showpiece AND the spec promised an entrance.
  const hasEntranceScene = scenes.some((s) => s.trigger === 'load');
  const showpiece = isShowpiece(frameMd);

  if (showpiece && hasEntranceScene) {
    // Probe snapshots at t=0ms and t=500ms cover the entrance window.
    const snap0Anims = motionProbe.snapshots?.[0]?.animations.length ?? 0;
    const snap500Anims = motionProbe.snapshots?.[1]?.animations.length ?? 0;
    const probeEntranceDetected = snap0Anims > 0 || snap500Anims > 0;

    // Energy from the first frame pair (t=0→t+interval) covers the same window.
    const entranceEnergy = energyCurve !== null && energyCurve.pairs.length > 0
      ? energyCurve.pairs[0]!.changedFraction
      : null;
    const energyEntranceDetected = entranceEnergy !== null && entranceEnergy > 0.005;

    const entranceMeasured = probeEntranceDetected || energyEntranceDetected;

    if (!entranceMeasured) {
      violations.push({
        id: 'MOTION-NO-ENTRANCE',
        severity: 'warn',
        layer: 1,
        category: 'motion',
        nodeId: 'page',
        path: 'motion-spec',
        value: 'showpiece+entrance-spec+no-measured-entrance',
        message:
          'This page commits to the showpiece register and motion-spec.md describes a'
          + ' load-triggered entrance scene, but no entrance animation was detected'
          + ' (getAnimations reported zero at t=0 and t=500ms; filmstrip energy is also'
          + ' absent or zero). Either the entrance animation is not running, or it uses'
          + ' GSAP/rAF — in that case run `omd render --filmstrip` to confirm via the'
          + ' energy curve.',
      });
    }
  }

  return violations;
}

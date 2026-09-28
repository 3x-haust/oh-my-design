import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { inspectRenderedRefinementEvidence } from '../runtime/rendered-refinement.ts';
import { readPersistedRoute } from '../route/index.ts';
import { chosenCopyTone, readTranslation, requireCopyToneReview, type Target } from './index.ts';

export type Measurement = Readonly<{ schema: 'design-language-measurement-v1'; translationSha256: string; buildSha256: string; route: string; state: string; viewport: 'desktop' | 'mobile'; values: readonly Readonly<{ targetId: string; value: number; present: boolean }>[]; floors: Readonly<{ task: boolean; accessibility: boolean; safety: boolean }> }>;
export type MovementCheck = Readonly<{ schema: 'design-language-check-v1'; translationSha256: string; baselineSha256: string; afterSha256: string; passed: boolean; targets: readonly Readonly<{ id: string; before: number; after: number; passed: boolean }>[] }>;
const sha = (s: string | Uint8Array): string => createHash('sha256').update(s).digest('hex');
const fail = (code: string): never => { throw new Error(code); };
export function checkMovement(targets: readonly Target[], before: Measurement, after: Measurement): MovementCheck {
  if (before.schema !== 'design-language-measurement-v1' || after.schema !== before.schema || before.translationSha256 !== after.translationSha256 || before.route !== after.route || before.state !== after.state || before.viewport !== after.viewport || !/^[a-f0-9]{64}$/.test(before.buildSha256) || !/^[a-f0-9]{64}$/.test(after.buildSha256)) fail('FEEDBACK_BASELINE_STALE');
  if (!after.floors.task || !after.floors.accessibility || !after.floors.safety) fail('FEEDBACK_TARGET_UNMET');
  const rows = targets.map(t => {
    if (t.route !== before.route || t.state !== before.state || t.viewport !== before.viewport) fail('FEEDBACK_BASELINE_STALE');
    const b = before.values.find(v => v.targetId === t.id);
    const a = after.values.find(v => v.targetId === t.id);
    if (!b?.present || !a?.present || !Number.isFinite(b.value) || !Number.isFinite(a.value)) throw new Error('FEEDBACK_MEASUREMENT_REQUIRED');
    const delta = a.value - b.value;
    return { id: t.id, before: b.value, after: a.value, passed: (t.direction === 'increase' ? delta >= t.minDelta : delta <= -t.minDelta) && a.value >= t.range[0] && a.value <= t.range[1] };
  });
  const baselineSha256 = sha(`${canonicalJson(before)}\n`), afterSha256 = sha(`${canonicalJson(after)}\n`);
  return { schema: 'design-language-check-v1', translationSha256: before.translationSha256, baselineSha256, afterSha256, passed: rows.length > 0 && rows.every(r => r.passed), targets: rows };
}
export function publishMovement(root: string, writer: ProjectWriteAdapter, before: Measurement, after: Measurement, invocation: ProjectRunInvocation): MovementCheck {
  const translation = readTranslation(root, 'feedback', readPersistedRoute(root, invocation));
  if (!translation || translation.translation.status !== 'resolved' || before.translationSha256 !== translation.sha256) throw new Error('FEEDBACK_BASELINE_STALE');
  const baselinePath = join(root, '.omd/design-language/baseline.json');
  if (!existsSync(baselinePath) || readFileSync(baselinePath, 'utf8') !== `${canonicalJson(before)}\n`) fail('FEEDBACK_BASELINE_STALE');
  // This command closes the native scoped movement. The checkpoint/completion gate below separately
  // requires the current signed task/accessibility/safety evidence and independent Eye review.
  const chosen = translation.translation.readings.find(r => r.id === translation.translation.chosenId);
  if (!chosen) throw new Error('DESIGN_LANGUAGE_AMBIGUOUS');
  const check = checkMovement(chosen.targets, before, after);
  if (!check.passed) fail('FEEDBACK_TARGET_UNMET');
  const bytes = `${canonicalJson(check)}\n`, hash = sha(bytes);
  const record = `.omd/design-language/checks/sha256-${hash}.json`;
  writer.writeContentAddressed(`.omd/design-language/measurements/sha256-${check.afterSha256}.json`, `${canonicalJson(after)}\n`);
  writer.writeContentAddressed(record, bytes);
  writer.write('.omd/design-language/check.json', `${canonicalJson({ schema: 'design-language-pointer-v1', record, sha256: hash })}\n`);
  return check;
}
export function requireMovement(root: string, invocation?: ProjectRunInvocation): void {
  if (!existsSync(join(root, '.omd/design-language/feedback.json'))) return;
  const translation = readTranslation(root, 'feedback', invocation === undefined ? undefined : readPersistedRoute(root, invocation));
  if (!translation || translation.translation.status === 'not-applicable') return;
  if (translation.translation.status !== 'resolved') fail('DESIGN_LANGUAGE_AMBIGUOUS');
  if (chosenCopyTone(translation.translation)) {
    if (invocation === undefined) throw new Error('DESIGN_LANGUAGE_REQUIRED');
    requireCopyToneReview(root, readPersistedRoute(root, invocation));
    return;
  }
  const pointerPath = join(root, '.omd/design-language/check.json');
  if (!existsSync(pointerPath)) fail('FEEDBACK_TARGET_UNMET');
  try {
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { schema: string; record: string; sha256: string };
    if (pointer.schema !== 'design-language-pointer-v1' || !/^[a-f0-9]{64}$/.test(pointer.sha256) || pointer.record !== `.omd/design-language/checks/sha256-${pointer.sha256}.json`) fail('FEEDBACK_TARGET_UNMET');
    const bytes = readFileSync(join(root, pointer.record));
    const check = JSON.parse(bytes.toString('utf8')) as MovementCheck;
    if (sha(bytes) !== pointer.sha256 || canonicalJson(check) + '\n' !== bytes.toString('utf8') || check.schema !== 'design-language-check-v1' || check.translationSha256 !== translation.sha256 || !check.passed || !check.targets.length || check.targets.some(t => !t.passed)) fail('FEEDBACK_TARGET_UNMET');
    const before = JSON.parse(readFileSync(join(root, '.omd/design-language/baseline.json'), 'utf8')) as Measurement;
    const afterBytes = readFileSync(join(root, `.omd/design-language/measurements/sha256-${check.afterSha256}.json`));
    if (sha(afterBytes) !== check.afterSha256) fail('FEEDBACK_TARGET_UNMET');
    const after = JSON.parse(afterBytes.toString('utf8')) as Measurement;
    const chosen = translation.translation.readings.find(r => r.id === translation.translation.chosenId);
    if (!chosen || canonicalJson(checkMovement(chosen.targets, before, after)) !== canonicalJson(check)) fail('FEEDBACK_TARGET_UNMET');
    if (invocation !== undefined) {
      const evidence = inspectRenderedRefinementEvidence({ root, invocation });
      if (after.buildSha256 !== evidence.after.productionRevisionSha256 || evidence.after.observedGates.task !== 'pass' || evidence.after.observedGates.accessibility !== 'pass' || evidence.after.observedGates.safety !== 'pass') fail('FEEDBACK_BASELINE_STALE');
    }
  } catch { fail('FEEDBACK_TARGET_UNMET'); }
}

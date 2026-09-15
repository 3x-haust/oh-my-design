import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACQUISITION_PLAN_V2_SCHEMA, validateAcquisitionPlan } from '../deliberation/contracts.ts';

/** Derive coverage kinds from the current Framer-owned plan, never from Scout signal labels. */
export function acquisitionAuditScope(root: string): { zones?: readonly string[]; appearanceZones?: readonly string[] } {
  const path = join(root, '.omd', 'acquisition-plan.json');
  if (!existsSync(path)) return {};
  const result = validateAcquisitionPlan(JSON.parse(readFileSync(path, 'utf8')));
  const plan = result.value;
  if (plan === undefined) throw new Error(`invalid acquisition plan: ${result.findings.map(finding => `${finding.id} ${finding.path}`).join(', ')}`);
  return {
    zones: plan.zones.filter(zone => zone.required).map(zone => zone.id),
    appearanceZones: plan.schema === ACQUISITION_PLAN_V2_SCHEMA
      ? plan.zones.filter(zone => zone.required && zone.evidenceRequirement?.kind === 'visible-appearance').map(zone => zone.id)
      : [],
  };
}

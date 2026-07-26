import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ContractFinding,
  type AcquisitionPlan,
  type DecisionGraph,
  validateAssemblyCoverage,
  validateAcquisitionPlan,
  validateDecisionGraph,
  validateDeliberation,
  validateObservation,
} from './contracts.ts';
import { classifyDepth, type DepthInput, type DepthResult } from './depth.ts';

export type DeliberationRunReport = {
  readonly ok: boolean;
  readonly depth?: DepthResult;
  readonly findings: readonly ContractFinding[];
  readonly counts: { readonly decisions: number; readonly deliberations: number; readonly observations: number; readonly zones: number };
};

const parse = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const missing = (path: string, message: string): ContractFinding => ({ id: 'DELIBERATION-ARTIFACT-MISSING', path, message });

export function checkDeliberationRun(cwd: string): DeliberationRunReport {
  const dir = join(cwd, '.omd'); const findings: ContractFinding[] = [];
  const depthPath = join(dir, 'depth.json');
  let depth: DepthResult | undefined;
  if (!existsSync(depthPath)) findings.push(missing('.omd/depth.json', 'classify loop depth before design work'));
  else {
    try { depth = classifyDepth(parse(depthPath) as DepthInput); }
    catch (error) { findings.push({ id: 'DEPTH-INVALID', path: '.omd/depth.json', message: error instanceof Error ? error.message : String(error) }); }
  }

  const acquisitionPath = join(dir, 'acquisition-plan.json'); let acquisition: AcquisitionPlan | undefined;
  if (depth && ['L3', 'L4'].includes(depth.level)) {
    if (!existsSync(acquisitionPath)) findings.push(missing('.omd/acquisition-plan.json', 'framer must name every section, region, or state the scout needs to cover'));
    else try {
      const result = validateAcquisitionPlan(parse(acquisitionPath)); findings.push(...result.findings); acquisition = result.value;
    } catch (error) { findings.push({ id: 'ACQUISITION-PLAN-JSON', path: '.omd/acquisition-plan.json', message: error instanceof Error ? error.message : String(error) }); }
  }

  const graphPath = join(dir, 'decision-graph.json'); let graph: DecisionGraph | undefined;
  if (!existsSync(graphPath)) findings.push(missing('.omd/decision-graph.json', 'externalize consequential design decisions'));
  else {
    try { const result = validateDecisionGraph(parse(graphPath)); findings.push(...result.findings); graph = result.value; }
    catch (error) { findings.push({ id: 'DECISION-GRAPH-JSON', path: '.omd/decision-graph.json', message: error instanceof Error ? error.message : String(error) }); }
  }
  if (depth && graph) {
    const requiredStages = depth.level === 'L1'
      ? ['refinement']
      : depth.level === 'L2'
        ? ['frame', 'composition', 'production']
        : ['frame', 'copy', 'type', 'composition', 'structure', 'production'];
    const present = new Set(graph.decisions.map((decision) => decision.stage));
    for (const stage of requiredStages) {
      if (!present.has(stage as import('./contracts.ts').DecisionStage)) findings.push({
        id: 'DECISION-STAGE-UNCOVERED',
        path: '.omd/decision-graph.json',
        message: `${depth.level} requires an owner-authored ${stage} decision entry`,
      });
    }
  }

  const coveragePath = join(dir, 'assembly-coverage.json'); let zones = 0;
  if (depth && ['L3', 'L4'].includes(depth.level)) {
    if (!existsSync(coveragePath)) findings.push(missing('.omd/assembly-coverage.json', 'bind every selected composition zone from reference to final evidence'));
    else try {
      const raw = parse(coveragePath); if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { zones?: unknown }).zones)) zones = (raw as { zones: unknown[] }).zones.length;
      findings.push(...validateAssemblyCoverage(raw, graph).findings);
      if (acquisition && typeof raw === 'object' && raw !== null && Array.isArray((raw as { expectedZones?: unknown }).expectedZones)) {
        const required = acquisition.zones.filter((zone) => zone.required).map((zone) => zone.id).sort();
        const expected = [...((raw as { expectedZones: string[] }).expectedZones)].sort();
        if (required.length !== expected.length || required.some((id, i) => id !== expected[i])) {
          findings.push({ id: 'ASSEMBLY-ACQUISITION-DRIFT', path: '.omd/assembly-coverage.json:expectedZones', message: 'final assembly zones must exactly cover the required acquisition zones; revise the plan explicitly before composition rather than silently dropping a section' });
        }
      }
    } catch (error) { findings.push({ id: 'ASSEMBLY-COVERAGE-JSON', path: '.omd/assembly-coverage.json', message: error instanceof Error ? error.message : String(error) }); }
  }

  const observationDir = join(dir, 'observations'); let observations = 0;
  if (!existsSync(observationDir)) findings.push(missing('.omd/observations/', 'record observable before/after render judgments'));
  else {
    const files = readdirSync(observationDir).filter((name) => name.endsWith('.json')).sort(); observations = files.length;
    if (files.length === 0) findings.push(missing('.omd/observations/*.json', 'at least one Observe → Judge → Modify → Re-observe record is required'));
    for (const file of files) try { findings.push(...validateObservation(parse(join(observationDir, file))).findings.map((f) => ({ ...f, path: `.omd/observations/${file}:${f.path}` }))); }
    catch (error) { findings.push({ id: 'OBSERVATION-JSON', path: `.omd/observations/${file}`, message: error instanceof Error ? error.message : String(error) }); }
  }

  const deliberationDir = join(dir, 'deliberations'); let deliberations = 0;
  if (depth?.requiresDeliberation) {
    if (!existsSync(deliberationDir)) findings.push(missing('.omd/deliberations/', 'L4 requires independent UX, art-direction, and production perspectives'));
    else {
      const files = readdirSync(deliberationDir).filter((name) => name.endsWith('.json')).sort(); deliberations = files.length;
      if (files.length === 0) findings.push(missing('.omd/deliberations/*.json', 'L4 requires at least one moderated high-risk decision'));
      for (const file of files) try { findings.push(...validateDeliberation(parse(join(deliberationDir, file)), graph).findings.map((f) => ({ ...f, path: `.omd/deliberations/${file}:${f.path}` }))); }
      catch (error) { findings.push({ id: 'DELIBERATION-JSON', path: `.omd/deliberations/${file}`, message: error instanceof Error ? error.message : String(error) }); }
    }
  }

  return {
    ok: findings.length === 0,
    ...(depth ? { depth } : {}),
    findings,
    counts: { decisions: graph?.decisions.length ?? 0, deliberations, observations, zones },
  };
}

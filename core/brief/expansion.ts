import * as v from './candidate-data.ts';
import { parseSurfaceMappings, type SurfaceMapping } from './surface-coverage.ts';
import { requiredSurfaceCells, type SurfacePlan } from '../frame/process-plan.ts';

export function machineSection(markdown: string, heading: string): unknown {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...markdown.matchAll(new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'gm'))];
  if (matches.length !== 1) v.fail(`exactly one ${heading} section required`);
  const body = matches[0]![1]!.trim(), block = /^```json\s*\n([\s\S]*?)\n```$/.exec(body);
  if (!block) v.fail(`${heading} must contain one closed JSON block`);
  return JSON.parse(block![1]!);
}
export type NeededComponent = Readonly<{ id: string; users: readonly { surfaceId: string; stateId: string }[];
  variants: readonly string[]; tokenRoles: readonly string[]; sizing: string; overflow: string;
  reuse: { componentId: string | null; reason: string } }>;
export function checkExpansionContract(markdown: string, plan: SurfacePlan, tokenRoles: readonly string[]) {
  const needed = v.object(machineSection(markdown, 'Needed components'), ['schema', 'components']);
  v.enumeration(needed.schema, ['needed-components-v1']);
  const components: NeededComponent[] = v.list(needed.components, value => {
    const c = v.object(value, ['id', 'users', 'variants', 'tokenRoles', 'sizing', 'overflow', 'reuse']);
    const id = v.id(c.id), roles = v.ids(c.tokenRoles), reuse = v.object(c.reuse, ['componentId', 'reason']);
    const users = v.list(c.users, value => {
      const u = v.object(value, ['surfaceId', 'stateId']), surfaceId = v.id(u.surfaceId), stateId = v.id(u.stateId), surface = plan.surfaces.find(s => s.id === surfaceId);
      if (!surface?.componentIds.includes(id) || !surface.states.some(s => s.id === stateId)) v.fail('component has no declared surface/state need');
      return { surfaceId, stateId };
    });
    v.unique(users, u => `${u.surfaceId}:${u.stateId}`);
    if (!users.length || roles.some(role => !tokenRoles.includes(role))) v.fail('component needs actual users and known effective token roles');
    return { id, users, variants: v.ids(c.variants), tokenRoles: roles, sizing: v.text(c.sizing), overflow: v.text(c.overflow),
      reuse: { componentId: reuse.componentId === null ? null : v.text(reuse.componentId), reason: v.text(reuse.reason) } };
  });
  v.unique(components, c => c.id);
  const expectedComponents = [...new Set(plan.surfaces.flatMap(s => s.componentIds))].sort();
  if (v.digest(components.map(c => c.id).sort()) !== v.digest(expectedComponents)) v.fail('needed components must cover exactly Frame components, not a default library');
  const expansion = v.object(machineSection(markdown, 'Expansion mapping'), ['schema', 'cells']);
  v.enumeration(expansion.schema, ['surface-expansion-v1']);
  const cells: readonly SurfaceMapping[] = parseSurfaceMappings(expansion.cells);
  const cellKey = (c: { surfaceId: string; stateId: string; viewId: string }) => JSON.stringify([c.surfaceId, c.stateId, c.viewId]);
  v.unique(cells, cellKey);
  if (v.digest(cells.map(cellKey).sort()) !== v.digest(requiredSurfaceCells(plan).map(cellKey).sort())) v.fail('expansion must preserve all requested required surface/state/views');
  return { components, cells };
}

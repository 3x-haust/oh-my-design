import type { Contracts } from './contracts.ts';
import { hexColor, roleSize } from './contracts.ts';
import type { FindingCode, MeasureNode, MeasurementDom, MetricValues } from './types.ts';
import { backdrop, parseFlatColor } from './color.ts';
import { minimalTokenScales } from '../tokens/contract.ts';
import type { Primitive } from '../tokens/minimal.ts';
export type ConformanceIssue = { code: FindingCode; subjects: string[]; field: string; expected: string; actual: string };
export function assignRoles(dom: MeasurementDom, contracts: Contracts): void {
  if (!contracts.type) return;
  for (const n of dom.nodes) {
    if (!n.text.trim()) continue;
    const roles = contracts.type.assignments.filter(a => n.assignments.includes(a.selector)).map(a => a.role);
    if (roles.length === 1) n.role = roles[0]!;
    else if (roles.length === 0 && n.role === 'body') n.role = contracts.type.defaultTextRole;
  }
}
export function conformance(dom: MeasurementDom, contracts: Contracts): { value: MetricValues['contract-conformance']; issues: ConformanceIssue[] } {
  const observations: MetricValues['contract-conformance']['observations'] = [], issues: ConformanceIssue[] = [];
  const observe = (role: string, property: string, nodes: MeasureNode[], expected: unknown, actual: unknown[], pass: boolean, code: FindingCode, field: string, unmeasured = false) => {
    const exp = JSON.stringify(expected), act = actual.map(a => JSON.stringify(a));
    observations.push({ role, property, subjectIds: nodes.map(n => n.id), expected: exp, actual: act, result: unmeasured ? 'unmeasured' : pass ? 'pass' : 'mismatch', field });
    if (!pass || unmeasured) issues.push({ code, subjects: nodes.map(n => n.id), field, expected: exp, actual: act.join(',') });
  };
  const text = dom.nodes.filter(n => n.visibleBox && n.text.trim());
  if (contracts.selectedAssignments && contracts.tokens?.schema === 'token-commit-v3') {
    const tokens = contracts.tokens;
    for (const node of text) {
      const expectedRole = node.contentId ? contracts.selectedAssignments[node.contentId] : undefined;
      if (expectedRole !== undefined) observe(expectedRole, 'selected-assignment', [node], expectedRole, [node.textStyleId ?? null], node.textStyleId === expectedRole, 'TYPE_ROLE_UNASSIGNED', `selected-system.assignments.${node.contentId}`);
      const roleId = node.textStyleId ?? node.role, style = tokens.textStyles[roleId];
      if (!style) { observe(roleId, 'selected-text-style', [node], Object.keys(tokens.textStyles), [roleId], false, 'TYPE_ROLE_UNASSIGNED', 'selected-system.textStyles'); continue; }
      const family = tokens.primitives[style.familyRef] as Extract<Primitive, { type: 'font-family' }>;
      const size = tokens.primitives[style.sizeRef] as Extract<Primitive, { type: 'number' }>;
      const leading = tokens.primitives[style.lineHeightRef] as Extract<Primitive, { type: 'number' }>;
      const tracking = style.letterSpacingRef === null ? null : tokens.primitives[style.letterSpacingRef] as Extract<Primitive, { type: 'number' }>;
      const expectedFamilies = family.value.map(f => f.trim().toLowerCase()), expectedLeading = leading.unit === 'px' ? leading.value : leading.value * size.value;
      observe(roleId, 'selected-size', [node], size.value, [node.size], Math.abs(size.value - node.size) <= 0.25, 'TYPE_ROLE_SIZE_MISMATCH', `selected-system.textStyles.${roleId}`);
      observe(roleId, 'selected-weight', [node], style.weight, [node.weight], style.weight === node.weight, 'TYPE_ROLE_WEIGHT_MISMATCH', `selected-system.textStyles.${roleId}`);
      observe(roleId, 'selected-families', [node], expectedFamilies, [node.families], JSON.stringify(expectedFamilies) === JSON.stringify(node.families), 'TYPE_ROLE_FAMILY_MISMATCH', `selected-system.textStyles.${roleId}`);
      observe(roleId, 'selected-leading', [node], expectedLeading, [node.leading], typeof node.leading === 'number' && Math.abs(expectedLeading - node.leading) <= 0.25, 'TYPE_ROLE_LEADING_MISMATCH', `selected-system.textStyles.${roleId}`);
      if (tracking) observe(roleId, 'selected-tracking', [node], tracking.value, [node.tracking], Math.abs(tracking.value - node.tracking) <= 0.25, 'TYPE_ROLE_TRACKING_MISMATCH', `selected-system.textStyles.${roleId}.tracking`);
    }
  }
  const skipped = (kind: 'type' | 'composition') => observations.push({ role: kind, property: 'applicability', subjectIds: [], expected: 'route-authorized skip', actual: ['not-selected'], result: 'not-applicable', field: `route.strategy.skips.${kind === 'type' ? 'type-proof' : kind}` });
  if (!contracts.type && contracts.routeSkipped?.type) skipped('type');
  else if (!contracts.type) observe('type', 'contract', [], 'selected measurable type-proof', [], false, 'CONTRACT_UNMEASURABLE', 'type-proof.Measurement contract', true);
  else {
    const c = contracts.type;
    for (const n of text) {
      const mappings = c.assignments.filter(a => n.assignments.includes(a.selector));
      const ambiguous = new Set(mappings.map(a => a.role)).size > 1;
      const role = c.roles.find(r => r.id === n.role);
      if (!role || ambiguous) { observe(n.role, 'assignment', [n], 'unique selected role', mappings.map(a => a.role), false, 'TYPE_ROLE_UNASSIGNED', 'type-proof.assignments'); continue; }
      const expectedSize = roleSize(role, dom.viewport.innerWidth);
      if (contracts.tokens) {
        const token = contracts.tokens;
        const scale = token.schema === 'token-commit-v3' ? minimalTokenScales(token).typeScale : token.schema === 'token-commit-v2' ? token.responsiveTypeScales.find(s => dom.viewport.innerWidth <= s.maxWidth)?.typeScale ?? token.typeScale : token.typeScale;
        observe(role.id, 'token-scale', [n], scale, [expectedSize], scale.some(s => Math.abs(s - expectedSize) <= 0.25), 'CONTRACT_INPUT_CONFLICT', `tokens.typeScale.${role.id}`);
      }
      const family = c.families.find(f => f.id === role.familyId)!.stack.map(f => f.trim().replace(/^["']|["']$/g, '').toLowerCase());
      observe(role.id, 'size', [n], expectedSize, [n.size], Math.abs(n.size - expectedSize) <= 0.25 && n.size >= role.minimumReadablePx, 'TYPE_ROLE_SIZE_MISMATCH', `type-proof.roles.${role.id}.size`);
      observe(role.id, 'weight', [n], role.weights, [n.weight], role.weights.includes(n.weight), 'TYPE_ROLE_WEIGHT_MISMATCH', `type-proof.roles.${role.id}.weights`);
      observe(role.id, 'families', [n], family, [n.families], JSON.stringify(family) === JSON.stringify(n.families), 'TYPE_ROLE_FAMILY_MISMATCH', `type-proof.families.${role.familyId}`);
      const leading = role.leading === 'normal' ? n.leading === 'normal' : typeof n.leading === 'number' && Math.abs(n.leading / n.size - role.leading) <= 0.01;
      observe(role.id, 'leading', [n], role.leading, [n.leading === 'normal' ? 'normal' : n.leading / n.size], leading, 'TYPE_ROLE_LEADING_MISMATCH', `type-proof.roles.${role.id}.leading`);
    }
    for (const role of c.roles.filter(r => r.required)) if (!text.some(n => n.role === role.id)) observe(role.id, 'presence', [], true, [false], false, 'TYPE_ROLE_UNASSIGNED', `type-proof.roles.${role.id}.required`);
  }
  if (!contracts.composition && contracts.routeSkipped?.composition) skipped('composition');
  else if (!contracts.composition) observe('composition', 'contract', [], 'selected measurable composition', [], false, 'CONTRACT_UNMEASURABLE', 'composition.Measurement contract', true);
  else {
    const c = contracts.composition;
    for (const color of c.colors) {
      const nodes = dom.nodes.filter(n => n.visibleBox && n.assignments.includes(color.selector)), expected = hexColor(color.value);
      const actual = color.role === 'canvas' ? [dom.rootCanvas] : nodes.map(n => color.property === 'text' ? n.foreground : backdrop(n));
      observe(color.role, 'color', nodes, expected, actual, actual.length > 0 && actual.every(a => a.every((channel, i) => Math.abs(channel - expected[i]!) <= (i === 3 ? 0 : 1))), 'COLOR_ROLE_MISMATCH', `composition.colors.${color.role}`);
      if (color.token) {
        const resolved = nodes.map(n => parseFlatColor(n.customProperties.find(p => p.name === color.token)?.value ?? ''));
        observe(color.role, 'token-value', nodes, expected, resolved, resolved.length > 0 && resolved.every(a => a !== null && a.every((channel, i) => Math.abs(channel - expected[i]!) <= (i === 3 ? 0 : 1))), resolved.some(c => c === null) ? 'CONTRACT_UNMEASURABLE' : 'COLOR_ROLE_MISMATCH', `composition.colors.${color.role}.token`, resolved.some(c => c === null));
      }
    }
    for (const region of c.regions) {
      const nodes = dom.nodes.filter(n => n.visibleBox && n.assignments.includes(region.selector));
      observe(region.role, 'visible-count', nodes, region.minimumVisible, [nodes.length], nodes.length >= region.minimumVisible, 'REQUIRED_OBJECT_MISSING', `composition.regions.${region.selector}`);
    }
    for (const relationship of c.relationships) {
      const before = dom.nodes.filter(n => n.visibleBox && n.assignments.includes(relationship.before)), after = dom.nodes.filter(n => n.visibleBox && n.assignments.includes(relationship.after));
      const pass = before.length === 1 && after.length === 1 && (before[0]!.box.y < after[0]!.box.y || Math.abs(before[0]!.box.y - after[0]!.box.y) <= 2 && (before[0]!.direction === 'rtl' ? before[0]!.box.x > after[0]!.box.x : before[0]!.box.x < after[0]!.box.x));
      observe('sequence', 'before', [...before, ...after], relationship, [pass], pass, 'REQUIRED_ORDER_MISMATCH', 'composition.relationships');
    }
    if (c.spacing) for (const n of dom.nodes.filter(n => n.visibleBox)) for (const s of n.spacing.filter(s => s.value !== 0)) {
      const scale = c.spacing.scale, exception = c.spacing.opticalExceptions.some(e => n.assignments.includes(e.selector) && e.property === s.property && Math.abs(e.value - s.value) <= c.spacing!.tolerance);
      observe('spacing', s.property, [n], scale, [s.value], exception || scale.some(v => Math.abs(v - s.value) <= c.spacing!.tolerance), 'SPACING_ROLE_MISMATCH', 'composition.spacing.scale');
    }
  }
  for (const error of contracts.errors) observe('contract', 'input', [], 'measurable consistent contracts', [error], false, error.includes('CONTRACT_INPUT_CONFLICT') ? 'CONTRACT_INPUT_CONFLICT' : 'CONTRACT_UNMEASURABLE', 'contracts', true);
  return { value: { observations, applicability: contracts.type && contracts.composition ? 'selected'
    : (contracts.type || contracts.routeSkipped?.type) && (contracts.composition || contracts.routeSkipped?.composition) ? 'route-authorized' : 'missing' }, issues };
}

import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { readFrame } from '../frame/index.ts';
import { readCurrentCandidateSelection, selectedCandidateBase, type CandidateSelection } from '../brief/candidate-choice.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { parseTokenMaps, validateTokenReferences, validateMinimalTokens, type TokenMaps, type MinimalTokenCommit } from './minimal.ts';
import * as v from '../brief/candidate-data.ts';
export const TOKEN_EXTENSIONS_PATH = '.omd/token-extensions.json';
const RECEIPT_PATH = '.omd/token-extension-receipt.json';
export type TokenExtensions = TokenMaps & Readonly<{ schema: 'token-extensions-v1'; neededBy: readonly { tokenId: string; surfaceId: string; stateId: string; componentId: string }[] }>;
export function parseTokenExtensions(value: unknown): TokenExtensions {
  const e = v.object(value, ['schema', 'primitives', 'semantic', 'textStyles', 'neededBy']); v.enumeration(e.schema, ['token-extensions-v1']);
  const maps = parseTokenMaps(e), neededBy = v.list(e.neededBy, value => { const n = v.object(value, ['tokenId', 'surfaceId', 'stateId', 'componentId']); return { tokenId: v.text(n.tokenId), surfaceId: v.id(n.surfaceId), stateId: v.id(n.stateId), componentId: v.id(n.componentId) }; });
  v.unique(neededBy, n => v.digest(n));
  const keys = (['primitives', 'semantic', 'textStyles'] as const).flatMap(namespace => Object.keys(maps[namespace]).map(key => `${namespace}.${key}`));
  if (neededBy.some(n => !keys.includes(n.tokenId)) || keys.some(id => !neededBy.some(n => n.tokenId === id))) v.fail('every added token needs its namespace-qualified neededBy component/state; no speculative library tokens');
  return { schema: 'token-extensions-v1', ...maps, neededBy };
}
export function mergeTokenExtensions(base: TokenMaps, addition: TokenExtensions): TokenMaps {
  for (const namespace of ['primitives', 'semantic', 'textStyles'] as const) {
    for (const key of Object.keys(addition[namespace])) if (Object.hasOwn(base[namespace], key)) v.fail(`token extension collision: ${namespace}.${key}; never overwrite, retarget, delete or edit selected roles`);
  }
  const merged = { primitives: { ...base.primitives, ...addition.primitives }, semantic: { ...base.semantic, ...addition.semantic }, textStyles: { ...base.textStyles, ...addition.textStyles } };
  validateTokenReferences(merged); return merged;
}
function readExtensions(root: string, baseTokensSha256: string): TokenExtensions | null {
  if (!existsSync(join(root, TOKEN_EXTENSIONS_PATH)) && !existsSync(join(root, RECEIPT_PATH))) return null;
  const r = v.object(JSON.parse(v.readBytes(root, RECEIPT_PATH).toString('utf8')), ['schema', 'extensions', 'baseTokensSha256', 'signature']);
  v.enumeration(r.schema, ['token-extension-receipt-v1']); const extensions = v.receipt(r.extensions);
  const { signature, ...payload } = r;
  if (extensions.path !== TOKEN_EXTENSIONS_PATH || r.baseTokensSha256 !== baseTokensSha256 || typeof signature !== 'string'
    || !verifyNativeObservation(realpathSync(root), 'token-extensions-v1', v.digest(payload), signature)) v.fail('token extensions were edited outside the additive publisher or belong to another direction');
  return parseTokenExtensions(JSON.parse(v.readReceipt(root, extensions).toString('utf8')));
}
/** Derived only: never replaces the immutable seed with a flattened generated merge. */
export function resolveSelectedTokens(root: string, selection?: CandidateSelection) {
  const current = readCurrentCandidateSelection(root);
  if (selection && v.digest(selection) !== v.digest(current)) v.fail('supplied token selection is not the current direction');
  const base = selectedCandidateBase(root, current), baseTokensSha256 = v.digest(base);
  if (baseTokensSha256 !== current.effectiveBaseTokensSha256) v.fail('selected token base changed');
  const extensions = readExtensions(root, baseTokensSha256), maps = extensions ? mergeTokenExtensions(base, extensions) : base;
  const effective: MinimalTokenCommit = { schema: 'token-commit-v3', scope: base.scope, primitives: maps.primitives, semantic: maps.semantic, textStyles: maps.textStyles };
  return { base, effective, baseTokensSha256, effectiveTokensSha256: v.digest(effective), extensions,
    driftExpectations: { semantic: base.semantic, textStyles: base.textStyles } };
}
/** Host measurement/role delivery uses this exact mapping, not name heuristics. Remapping an
 * existing role to a new alias is a direction change even if the new token has the same value. */
export function assertRepresentativeTokenAssignments(selected: Readonly<Record<string, string>>, observed: Readonly<Record<string, string>>): void {
  for (const [role, token] of Object.entries(selected)) if (observed[role] !== token) v.fail(`STALE_DIRECTION: representative role ${role} was remapped; a new token name cannot disguise an override`);
}
export function extendSelectedTokens(root: string, value: unknown, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation) {
  requireProjectWriteAdapterForInvocation(root, writer, invocation); const unlock = acquireProjectMutationLock(root, invocation);
  try {
    const addition = parseTokenExtensions(value), resolved = resolveSelectedTokens(root), frame = readFrame(root);
    for (const need of addition.neededBy) {
      const surface = frame?.surfacePlan?.surfaces.find(s => s.id === need.surfaceId);
      if (!surface || !surface.states.some(s => s.id === need.stateId) || !surface.componentIds.includes(need.componentId)) v.fail('extension neededBy must name a real Frame component/state');
    }
    mergeTokenExtensions(resolved.effective, addition);
    const previous = resolved.extensions, merged = { primitives: { ...previous?.primitives, ...addition.primitives }, semantic: { ...previous?.semantic, ...addition.semantic }, textStyles: { ...previous?.textStyles, ...addition.textStyles } };
    const all: TokenExtensions = { schema: 'token-extensions-v1', primitives: merged.primitives, semantic: merged.semantic, textStyles: merged.textStyles, neededBy: [...(previous?.neededBy ?? []), ...addition.neededBy] };
    // Extension references can target the selected base, so validate the complete effective system.
    validateTokenReferences({ ...resolved.base, primitives: { ...resolved.base.primitives, ...all.primitives }, semantic: { ...resolved.base.semantic, ...all.semantic }, textStyles: { ...resolved.base.textStyles, ...all.textStyles } });
    const bytes = v.jsonBytes(all), extensions = { path: TOKEN_EXTENSIONS_PATH, sha256: v.hash(bytes) };
    const payload = { schema: 'token-extension-receipt-v1', extensions, baseTokensSha256: resolved.baseTokensSha256 };
    const signature = signNativeObservation(realpathSync(root), 'token-extensions-v1', v.digest(payload));
    v.publishRecord(writer, '.omd/token-extension-runs', { ...payload, additions: addition, previous: previous ? v.digest(previous) : null });
    replaceProjectFileAtomically({ projectRoot: root, relativePath: TOKEN_EXTENSIONS_PATH, content: bytes, invocation });
    replaceProjectFileAtomically({ projectRoot: root, relativePath: RECEIPT_PATH, content: v.jsonBytes({ ...payload, signature }), invocation });
    return { extensions, baseTokensSha256: resolved.baseTokensSha256, effectiveTokensSha256: v.digest({ ...resolved.base, primitives: { ...resolved.base.primitives, ...all.primitives }, semantic: { ...resolved.base.semantic, ...all.semantic }, textStyles: { ...resolved.base.textStyles, ...all.textStyles } }) };
  } finally { unlock(); }
}
/** Provisional seed inspection remains available before a choice and is not selected approval. */
export function readTokenSeed(root: string): MinimalTokenCommit { return validateMinimalTokens(JSON.parse(v.readBytes(root, '.omd/tokens.json').toString('utf8'))); }

import { realpathSync } from 'node:fs';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import * as v from './candidate-data.ts';
export type DirectionUserInput = Readonly<{
  schema: 'direction-user-input-v1'; projectRoot: string; requestSha256: string; sourceContractSha256: string;
  inputDigest: string; displayedSet: v.Receipt; pendingId: string; userMessage: string;
  source: 'pi-interactive' | 'pi-rpc' | 'host-user-input'; resumeAuthority: v.Receipt | null; signature: string;
}>;
export type DirectionAutonomyGrant = Readonly<{ schema: 'direction-autonomy-grant-v1'; projectRoot: string; requestSha256: string;
  userMessage: string; policy: 'autonomous-direction'; source: 'pi-interactive' | 'pi-rpc' | 'host-user-input'; signature: string }>;
export function parseDirectionUserInput(value: unknown): DirectionUserInput {
  const u = v.object(value, ['schema', 'projectRoot', 'requestSha256', 'sourceContractSha256', 'inputDigest', 'displayedSet', 'pendingId', 'userMessage', 'source', 'resumeAuthority', 'signature']);
  return { schema: v.enumeration(u.schema, ['direction-user-input-v1']), projectRoot: v.text(u.projectRoot), requestSha256: v.sha(u.requestSha256), sourceContractSha256: v.sha(u.sourceContractSha256), inputDigest: v.sha(u.inputDigest), displayedSet: v.receipt(u.displayedSet), pendingId: v.sha(u.pendingId), userMessage: v.text(u.userMessage), source: v.enumeration(u.source, ['pi-interactive', 'pi-rpc', 'host-user-input']), resumeAuthority: v.nullableReceipt(u.resumeAuthority), signature: v.text(u.signature) };
}
export function verifyDirectionUserInput(root: string, value: unknown): DirectionUserInput {
  const input = parseDirectionUserInput(value), { signature, ...payload } = input;
  if (input.projectRoot !== realpathSync(root) || !verifyNativeObservation(realpathSync(root), 'direction-user-input-v1', v.digest(payload), signature)) v.fail('user choice must come from actual host-observed user input, not an authored approval flag');
  if (input.resumeAuthority) v.readReceipt(root, input.resumeAuthority);
  return input;
}
export function verifyDirectionAutonomyGrant(root: string, receipt: v.Receipt, request: string): DirectionAutonomyGrant {
  const g = v.object(JSON.parse(v.readReceipt(root, receipt).toString('utf8')), ['schema', 'projectRoot', 'requestSha256', 'userMessage', 'policy', 'source', 'signature']);
  const grant: DirectionAutonomyGrant = { schema: v.enumeration(g.schema, ['direction-autonomy-grant-v1']), projectRoot: v.text(g.projectRoot), requestSha256: v.sha(g.requestSha256), userMessage: v.text(g.userMessage), policy: v.enumeration(g.policy, ['autonomous-direction']), source: v.enumeration(g.source, ['pi-interactive', 'pi-rpc', 'host-user-input']), signature: v.text(g.signature) };
  const { signature, ...payload } = grant;
  if (grant.projectRoot !== realpathSync(root) || grant.requestSha256 !== v.hash(request) || !verifyNativeObservation(realpathSync(root), 'direction-autonomy-grant-v1', v.digest(payload), signature)) v.fail('autonomous direction needs explicit current user/host authority; noninteractive execution and checkpoint:none are not grants');
  return grant;
}
/** Deliberately bounded, unambiguous answers. Unrecognized natural language stays pending rather
 * than allowing the coordinator to turn an interpretation into a user-authenticated selection. */
export function chosenDirectionId(userMessage: string, options: readonly string[]): string | null {
  const exact = options.filter(id => id.toLowerCase() === userMessage.trim().toLowerCase());
  if (exact.length === 1) return exact[0]!;
  const answer = userMessage.trim().replace(/[.!。]$/u, '');
  const match = /^(?:(?:I\s+)?(?:choose|select|pick|keep|confirm)\s+|direction\s+)?([A-Za-z0-9][A-Za-z0-9._:@-]*)(?:\s+(?:please|선택|선택할게요|선택합니다|유지))?$/iu.exec(answer);
  if (!match) return null;
  const matches = options.filter(id => id.toLowerCase() === match[1]!.toLowerCase());
  return matches.length === 1 ? matches[0]! : null;
}

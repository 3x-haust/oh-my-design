import { realpathSync } from 'node:fs';
import type { ProjectRunInvocation } from '../../runtime/invocation.ts';
import { requireProjectWriteInvocation } from '../../runtime/invocation.ts';
import { requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../../runtime/project-write.ts';
import { canonicalJson, sha256 } from './json.ts';
import { signed, verifySigned } from './trace.ts';
import { browseFail, type Binding } from './contract.ts';
import type { DriverRequest } from './driver.ts';

export type CommandTicket = Readonly<{ schema: 'browse-command-v1'; root: string; sessionId: string; sourceContractSha256: string;
  buildSha256: string; requestId: string; challenge: string; argumentsSha256: string; expiresAt: number; signature: string }>;
export function issueBrowseCommandTicket(binding: Binding, challenge: string, requestId: string, args: DriverRequest,
  invocation: ProjectRunInvocation, writer: ProjectWriteAdapter): CommandTicket {
  requireProjectWriteInvocation(invocation); requireProjectWriteAdapterForInvocation(binding.root, writer, invocation);
  const cleanup = args.operation !== 'action' || ['end', 'status'].includes(args.action.verb);
  if (invocation.current.buildSha256 !== binding.buildSha256 && !cleanup) browseFail('BROWSE_BUILD_STALE', 'installed invocation build changed', 2);
  return signed(binding.root, { schema: 'browse-command-v1' as const, root: realpathSync(binding.root), sessionId: binding.sessionId,
    sourceContractSha256: binding.sourceContractSha256, buildSha256: binding.buildSha256, requestId, challenge,
    argumentsSha256: sha256(canonicalJson(args)), expiresAt: Date.now() + 60_000 });
}
export function verifyBrowseCommandTicket(binding: Binding, challenge: string, ticket: CommandTicket, args: unknown): void {
  if (ticket.schema !== 'browse-command-v1' || ticket.root !== realpathSync(binding.root) || ticket.sessionId !== binding.sessionId
    || ticket.sourceContractSha256 !== binding.sourceContractSha256 || ticket.buildSha256 !== binding.buildSha256
    || ticket.challenge !== challenge || ticket.argumentsSha256 !== sha256(canonicalJson(args))
    || ticket.expiresAt < Date.now() || ticket.expiresAt > Date.now() + 65_000) browseFail('BROWSE_TICKET', 'stale or mismatched command authority', 2);
  verifySigned(binding.root, ticket);
}

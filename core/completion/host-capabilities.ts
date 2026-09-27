import { hostCapabilityMatrix, type HostCapabilityMatrix } from '../host-capability.ts';
import { isNativePiInvocation } from '../runtime/native-pi-run.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';

export function completionHostCapabilities(invocation?: ProjectRunInvocation): HostCapabilityMatrix {
  return hostCapabilityMatrix({ host: invocation?.activation.hostCapability.host ?? 'local',
    piHooksPresent: invocation !== undefined && isNativePiInvocation(invocation) });
}

/** The CLI and host final-message adapter use the same explicit enforcement/limitation report. */
export function formatCompletionHostCapabilities(value: unknown): string {
  if (value === undefined) return '';
  if (!value || typeof value !== 'object' || Reflect.get(value, 'schema') !== 'host-capability-matrix-v1') throw new Error('invalid completion host capabilities');
  const host = Reflect.get(value, 'host'), guarantees = Reflect.get(value, 'guarantees');
  if (typeof host !== 'string' || !guarantees || typeof guarantees !== 'object') throw new Error('invalid completion host capabilities');
  const lines = ['writeBoundary', 'reviewerIsolation', 'completionHold'].map(key => {
    const guarantee = Reflect.get(guarantees, key);
    if (!guarantee || typeof guarantee !== 'object' || typeof Reflect.get(guarantee, 'enforced') !== 'boolean'
      || typeof Reflect.get(guarantee, 'mechanism') !== 'string') throw new Error(`invalid host guarantee: ${key}`);
    return `${key}: ${Reflect.get(guarantee, 'enforced') ? 'enforced' : 'not-enforced'} - ${Reflect.get(guarantee, 'mechanism')}`;
  });
  return `Host capabilities (${host}):\n${lines.join('\n')}`;
}

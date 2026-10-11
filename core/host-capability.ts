import type { HostCapability } from './runtime/activation.ts';

export const HOST_CAPABILITY_MATRIX_SCHEMA = 'host-capability-matrix-v1' as const;
export type StructuralGuarantee = Readonly<{
  enforced: boolean;
  mechanism: string;
}>;
export type HostCapabilityMatrix = Readonly<{
  schema: typeof HOST_CAPABILITY_MATRIX_SCHEMA;
  host: HostCapability['host'];
  detection: string;
  guarantees: Readonly<{
    writeBoundary: StructuralGuarantee;
    reviewerIsolation: StructuralGuarantee;
    completionHold: StructuralGuarantee;
  }>;
}>;
export type HostCapabilityDetection = Readonly<{
  host: HostCapability['host'];
  piHooksPresent?: boolean;
  claudeDisallowedTools?: boolean;
  codexRestrictions?: 'prose-only';
}>;

const guarantee = (enforced: boolean, mechanism: string): StructuralGuarantee => Object.freeze({ enforced, mechanism });

/** Reports host structure only. Prompt instructions and caller claims never count as enforcement. */
export function hostCapabilityMatrix(input: HostCapabilityDetection): HostCapabilityMatrix {
  const host = input.host;
  if (host === 'pi') {
    const hooks = input.piHooksPresent === true;
    return Object.freeze({
      schema: HOST_CAPABILITY_MATRIX_SCHEMA, host,
      detection: hooks ? 'native Pi invocation with event hooks' : 'Pi-compatible host without observable event hooks',
      guarantees: Object.freeze({
        writeBoundary: guarantee(hooks, hooks ? 'Pi tool_call hook runs the production guard before host writes' : 'no host event hook can intercept direct writes'),
        reviewerIsolation: guarantee(hooks, hooks ? 'Pi reviewer RPC launches process-isolated lanes with authenticated evidence exchange' : 'no native Pi hook/runtime can launch an authenticated reviewer lane'),
        completionHold: guarantee(hooks, hooks ? 'Pi message_end hook runs completion handling before the final response' : 'no message_end hook can hold completion'),
      }),
    });
  }
  if (host === 'claude') {
    const denied = input.claudeDisallowedTools === true;
    return Object.freeze({
      schema: HOST_CAPABILITY_MATRIX_SCHEMA, host,
      detection: 'Claude activation context and generated agent frontmatter',
      guarantees: Object.freeze({
        writeBoundary: guarantee(false, 'OMD CLI writes are guarded, but Claude exposes no host hook that intercepts every direct project write'),
        reviewerIsolation: guarantee(denied, denied ? 'review roles combine host-enforced disallowedTools with the process-authenticated evidence proxy' : 'declarative reviewer tool denial is absent'),
        completionHold: guarantee(false, 'Claude adapter exposes no host message-end completion hook'),
      }),
    });
  }
  if (host === 'codex') {
    return Object.freeze({
      schema: HOST_CAPABILITY_MATRIX_SCHEMA, host,
      detection: input.codexRestrictions === 'prose-only' ? 'Codex activation with prose-only tool restrictions' : 'Codex activation context',
      guarantees: Object.freeze({
        writeBoundary: guarantee(false, 'Codex agent write denial is prose-only; only OMD CLI writes are structurally guarded'),
        reviewerIsolation: guarantee(false, 'review evidence transport is process-authenticated, but Codex reviewer tool denial remains prose-only'),
        completionHold: guarantee(false, 'Codex adapter exposes no host message-end completion hook'),
      }),
    });
  }
  if (host === 'benchmark') {
    return Object.freeze({
      schema: HOST_CAPABILITY_MATRIX_SCHEMA, host, detection: 'benchmark activation context',
      guarantees: Object.freeze({
        writeBoundary: guarantee(true, 'benchmark bundle and source-finalization seals constrain publication'),
        reviewerIsolation: guarantee(true, 'benchmark reviewer evidence is process- and bundle-bound'),
        completionHold: guarantee(true, 'benchmark publication requires the finalization gate'),
      }),
    });
  }
  return Object.freeze({
    schema: HOST_CAPABILITY_MATRIX_SCHEMA, host: 'local', detection: 'local CLI invocation without a host adapter',
    guarantees: Object.freeze({
      writeBoundary: guarantee(false, 'OMD CLI writes are guarded, but no host intercepts direct project writes'),
      reviewerIsolation: guarantee(false, 'no host reviewer launcher is active'),
      completionHold: guarantee(false, 'no host completion hook is active'),
    }),
  });
}

import type { PortablePiEvent } from './omd-runtime.ts';

/** Expand only canonical patch paths; the host still owns parsing and applying the hunks. */
export function nativeWriteEvents(event: PortablePiEvent): readonly PortablePiEvent[] | null {
  if (event.toolName !== 'apply_patch') return [event];
  const patch = event.input?.input;
  if (typeof patch !== 'string') return null;
  const lines = patch.replace(/\r\n?/g, '\n').trim().split('\n');
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') return null;
  const paths = new Set<string>();
  for (const line of lines.slice(1, -1)) {
    const target = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
    if (target?.[1]) paths.add(target[1]);
    else if (line.startsWith('*** ') && line !== '*** End of File') return null;
  }
  if (paths.size === 0) return null;
  return [...paths].map((path, index) => ({
    ...event,
    ...(event.toolCallId === undefined ? {} : { toolCallId: `${event.toolCallId}:patch:${index}` }),
    input: { ...event.input, path },
  }));
}

/** H2 sections actually consumed by owners of shared contracts. Dedicated packs are consumed whole.
 * Heading + nested content is the unit: editing a consumed rule remains a stale delivery.
 */
export const CONSUMED_CONTRACT_SECTIONS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  'protocol/human-design-loop.md': {
    frame: ['Surface outcomes and execution requirements', 'Domain analysis', 'State boundary',
      'Evidence and taste precedence', 'Surface grammar', 'Greenfield authenticity', 'Task coverage matrix', 'UX task coverage'],
  },
  'protocol/design-deliberation.md': {
    depth: ['Adaptive depth', 'Decision graph', 'L4 independent deliberation'],
    'art-direction': ['Decision graph', 'L4 independent deliberation', 'Visual observation', 'Assembly coverage', 'Comparative evaluation'],
  },
  'protocol/reference-assembly.md': {
    acquisition: ['Stage contract', 'Reference roles', 'Automatic discovery without supplied URLs', 'Capture granularity', 'Browser boundary'],
    scout: ['Stage contract', 'Reference roles', 'Automatic discovery without supplied URLs', 'Capture granularity', 'Capturing an existing state or open disclosure', 'Subject anchor', 'Browser boundary'],
    'reference-board': ['Stage contract', 'Reference roles', 'Capture granularity', 'Subject anchor', 'Chat-first presentation and selection', 'Browser boundary'],
    moodboard: ['Stage contract', 'Reference roles', 'Subject anchor', 'Chat-first presentation and selection'],
    'reference-selection': ['Stage contract', 'Reference roles', 'Chat-first presentation and selection', 'Executable, acyclic composition handoff'],
  },
};
export function consumedContractText(text: string, contract: string, stage: string): string {
  const consumed = CONSUMED_CONTRACT_SECTIONS[contract]?.[stage];
  if (!consumed) return text;
  const sections = new Map<string, string[]>();
  let current = '';
  // Ignore fenced example headings: they are content of the surrounding normative section.
  let fence: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || marker.startsWith(fence))) fence = fence ? undefined : marker;
    const heading = !fence && !marker ? /^## (.+?)\s*$/.exec(line) : null;
    if (heading) current = heading[1]!;
    const lines = sections.get(current) ?? [];
    lines.push(line);
    sections.set(current, lines);
  }
  return JSON.stringify({ contract, stage, sections: consumed.map(name => [name, sections.get(name)?.join('\n') ?? null]) });
}

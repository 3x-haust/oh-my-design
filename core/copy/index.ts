export const COPY_REQUIRED_SECTIONS = [
  'Sources and fact ledger',
  'Audience language',
  'Voice contract',
  'Surface copy',
  'Navigation and actions',
  'States and recovery',
  'Humanize audit',
] as const;

export type InteractionScope = 'stateful' | 'navigation-only' | 'static';

export interface CopyViolation {
  id: string;
  path: '.omd/copy-deck.md';
  message: string;
}

interface Fact {
  id: string;
  status: 'verified' | 'fixture' | 'open';
  source: string;
}

const issue = (id: string, message: string): CopyViolation => ({
  id,
  path: '.omd/copy-deck.md',
  message,
});

export function parseCopySections(md: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const chunk of md.split(/^##\s+/m).slice(1)) {
    const newline = chunk.indexOf('\n');
    const heading = (newline === -1 ? chunk : chunk.slice(0, newline)).trim().toLowerCase();
    if (heading) sections.set(heading, newline === -1 ? '' : chunk.slice(newline + 1));
  }
  return sections;
}

const hasContent = (body: string): boolean => body
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/[#*_`>|-]/g, '')
  .trim().length > 0;

function fieldValues(body: string, label: string): string[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = body.matchAll(new RegExp(`^\\s*[-*]?\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`, 'gim'));
  return [...matches].map((match) => match[1]?.trim() ?? '');
}

const field = (body: string, label: string): string | null => fieldValues(body, label)[0] ?? null;

const hasNaReason = (value: string | null): boolean => value !== null
  && /^N\/A\s*(?:—|-|:)\s*\S.+$/i.test(value);

function parseFacts(body: string, violations: CopyViolation[]): Map<string, Fact> {
  const facts = new Map<string, Fact>();
  const rows = body.split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const header = rows.findIndex((cells) => cells.map((cell) => cell.toLowerCase()).includes('id'));
  if (header === -1) {
    violations.push(issue('COPY-FACT-LEDGER', 'Fact ledger must use ID, Status, Source, and Fact columns.'));
    return facts;
  }
  const columns = rows[header]!.map((cell) => cell.toLowerCase());
  const idIndex = columns.indexOf('id');
  const statusIndex = columns.indexOf('status');
  const sourceIndex = columns.indexOf('source');
  const factIndex = columns.indexOf('fact');
  if ([idIndex, statusIndex, sourceIndex, factIndex].some((index) => index === -1)) {
    violations.push(issue('COPY-FACT-LEDGER', 'Fact ledger must use ID, Status, Source, and Fact columns.'));
    return facts;
  }
  for (const cells of rows.slice(header + 1)) {
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const id = cells[idIndex] ?? '';
    const status = (cells[statusIndex] ?? '').toLowerCase();
    const source = cells[sourceIndex] ?? '';
    const factText = cells[factIndex] ?? '';
    if (!id && !status && !source && !factText) continue;
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(id) || !['verified', 'fixture', 'open'].includes(status) || !source || /^(?:N\/A|none)$/i.test(source) || !factText) {
      violations.push(issue('COPY-FACT-LEDGER', `Invalid fact row "${id || '(missing ID)'}"; require ID, verified|fixture|open status, source, and fact.`));
      continue;
    }
    if (facts.has(id)) {
      violations.push(issue('COPY-FACT-LEDGER', `Duplicate fact ID: ${id}.`));
      continue;
    }
    facts.set(id, { id, status: status as Fact['status'], source });
  }
  if (facts.size === 0) violations.push(issue('COPY-FACT-LEDGER', 'Fact ledger must contain at least one explicit fact row.'));
  return facts;
}

interface SurfaceBlock {
  name: string;
  body: string;
}

function parseSurfaceBlocks(body: string): SurfaceBlock[] {
  return body.split(/^###\s+/m).slice(1).flatMap((chunk) => {
    const newline = chunk.indexOf('\n');
    const name = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
    return name ? [{ name, body: newline === -1 ? '' : chunk.slice(newline + 1) }] : [];
  });
}

function validateSurfaceCopy(body: string, facts: Map<string, Fact>, violations: CopyViolation[]): void {
  const surfaces = parseSurfaceBlocks(body);
  if (surfaces.length === 0) {
    violations.push(issue('COPY-SURFACE', 'Surface copy must contain at least one H3 surface block.'));
    return;
  }

  for (const surface of surfaces) {
    for (const label of ['Main message', 'Supporting fact', 'Next action', 'Claim refs']) {
      const values = fieldValues(surface.body, label);
      if (values.length !== 1) {
        violations.push(issue('COPY-SURFACE', `Surface "${surface.name}" must declare exactly one ${label} field.`));
      }
    }

    const refs = fieldValues(surface.body, 'Claim refs');
    if (refs.length !== 1) continue;
    const value = refs[0]!;
    if (/^none$/i.test(value)) continue;
    if (!/^[A-Z][A-Z0-9]*-\d+(?:\s*,\s*[A-Z][A-Z0-9]*-\d+)*$/.test(value)) {
      violations.push(issue('COPY-CLAIM-REF', `Surface "${surface.name}" has invalid Claim refs: ${value}. Use none or a comma-separated fact ID list.`));
      continue;
    }
    const ids = value.split(',').map((id) => id.trim());
    for (const id of ids) {
      const fact = facts.get(id);
      if (!fact) violations.push(issue('COPY-CLAIM-REF', `Surface "${surface.name}" references unknown fact ID ${id}.`));
      else if (fact.status !== 'verified') {
        violations.push(issue('COPY-CLAIM-REF', `Surface "${surface.name}" may reference only verified facts; ${id} is ${fact.status}.`));
      }
    }
  }
}

function validateVoiceContract(body: string, violations: CopyViolation[]): void {
  for (const label of ['Audience', 'Language', 'Register']) {
    if (fieldValues(body, label).length !== 1) {
      violations.push(issue('COPY-VOICE-CONTRACT', `Voice contract must declare exactly one ${label} field.`));
    }
  }
}

function validateInteraction(body: string, violations: CopyViolation[]): void {
  const scopeValues = fieldValues(body, 'Interaction scope');
  if (scopeValues.length !== 1) {
    violations.push(issue('COPY-INTERACTION-SCOPE', 'States and recovery must declare exactly one Interaction scope field.'));
  }
  for (const label of ['Primary copy', 'Recovery copy', 'Primary probe', 'Recovery probe']) {
    if (fieldValues(body, label).length !== 1) {
      violations.push(issue('COPY-STATE-CONTRACT', `States and recovery must declare exactly one ${label} field.`));
    }
  }

  const scopeValue = scopeValues[0] ?? null;
  const scope = scopeValue as InteractionScope | null;
  if (scopeValues.length !== 1 || !scope || !['stateful', 'navigation-only', 'static'].includes(scope)) {
    if (scopeValues.length === 1) {
      violations.push(issue('COPY-INTERACTION-SCOPE', 'Interaction scope must be exactly stateful, navigation-only, or static.'));
    }
    return;
  }

  const primaryCopy = field(body, 'Primary copy');
  const recoveryCopy = field(body, 'Recovery copy');
  const primaryProbe = field(body, 'Primary probe');
  const recoveryProbe = field(body, 'Recovery probe');
  if (!primaryCopy || /^N\/A\b/i.test(primaryCopy)) {
    violations.push(issue('COPY-STATE-CONTRACT', 'Primary copy is required for every interaction scope.'));
  }

  if (scope === 'stateful') {
    for (const [label, value] of [['Recovery copy', recoveryCopy], ['Primary probe', primaryProbe], ['Recovery probe', recoveryProbe]] as const) {
      if (!value || /^N\/A\b/i.test(value)) violations.push(issue('COPY-STATE-CONTRACT', `${label} is required for stateful surfaces.`));
    }
    return;
  }

  if (scope === 'navigation-only') {
    if (!primaryProbe || /^N\/A\b/i.test(primaryProbe)) {
      violations.push(issue('COPY-STATE-CONTRACT', 'Primary probe is required for navigation-only surfaces.'));
    }
    for (const [label, value] of [['Recovery copy', recoveryCopy], ['Recovery probe', recoveryProbe]] as const) {
      if (!hasNaReason(value)) violations.push(issue('COPY-STATE-CONTRACT', `${label} must be N/A with an explicit reason for navigation-only surfaces.`));
    }
    return;
  }

  for (const [label, value] of [['Recovery copy', recoveryCopy], ['Primary probe', primaryProbe], ['Recovery probe', recoveryProbe]] as const) {
    if (!hasNaReason(value)) violations.push(issue('COPY-STATE-CONTRACT', `${label} must be N/A with an explicit reason for static surfaces.`));
  }
}

/** Validate only explicit copy-deck structure and traceability; never score writing style. */
export function validateCopyDeck(md: string): CopyViolation[] {
  const violations: CopyViolation[] = [];
  if (!md.trim()) return [issue('COPY-MISSING', 'Copy deck is missing or empty.')];

  const sections = parseCopySections(md);
  for (const required of COPY_REQUIRED_SECTIONS) {
    const body = sections.get(required.toLowerCase());
    if (body === undefined) violations.push(issue('COPY-SECTION', `Missing required section: ${required}.`));
    else if (!hasContent(body)) violations.push(issue('COPY-SECTION', `Required section is empty: ${required}.`));
  }

  const placeholders = [
    /lorem ipsum/i,
    /<!--\s*(?:TODO|TBD|PLACEHOLDER|OPEN QUESTION)\s*-->/i,
    /(?:^|\n)\s*(?:(?:[-*]|#{1,6})\s*)?(?:TODO|TBD|\[(?:TODO|TBD|PLACEHOLDER|OPEN QUESTION)\])\s*(?=\n|$)/i,
    /(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?[^:\n]+?(?:\*\*)?\s*:\s*(?:TODO|TBD|\[(?:TODO|TBD|PLACEHOLDER|OPEN QUESTION)\])\s*(?=\n|$)/i,
    /(?:^|\n)\s*[-*]?\s*(?:\*\*)?Open question(?:\*\*)?\s*:/i,
  ];
  if (placeholders.some((pattern) => pattern.test(md))) {
    violations.push(issue('COPY-PLACEHOLDER', 'Resolve exact TODO/TBD/lorem/placeholder/open-question sentinels before build.'));
  }

  const factBody = sections.get('sources and fact ledger') ?? '';
  const facts = parseFacts(factBody, violations);
  validateVoiceContract(sections.get('voice contract') ?? '', violations);
  validateSurfaceCopy(sections.get('surface copy') ?? '', facts, violations);
  validateInteraction(sections.get('states and recovery') ?? '', violations);
  return violations;
}

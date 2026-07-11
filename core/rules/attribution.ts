import type { Ir, Violation } from '../types.ts';

/**
 * Token group names that attribution.md must cover.
 *
 * A group is "present" when the page's token map contains at least one key whose
 * prefix belongs to that group. Two formats are supported:
 *
 *   Flat CSS custom property map (runtime, from dom.ts):
 *     { "color-brand-primary": "#FF5A1F", "spacing-md": "16", ... }
 *     — keys are CSS variable names with the leading `--` stripped.
 *
 *   Nested Figma-style map (fixture / hand-written):
 *     { color: { "brand/primary": "#FF5A1F" }, spacing: { md: 16 } }
 *     — top-level key is already the group name.
 */
const GROUP_PREFIXES: Record<string, string[]> = {
  color: ['color', 'fill', 'bg', 'surface', 'foreground', 'background'],
  type: ['font', 'type', 'heading', 'body'],
  spacing: ['spacing', 'space', 'gap', 'padding', 'margin', 'inset'],
  radius: ['radius', 'corner', 'rounded'],
  motion: ['motion', 'duration', 'ease', 'transition', 'timing', 'animation', 'delay'],
};

const ALL_GROUPS = Object.keys(GROUP_PREFIXES);

/** Returns the set of token groups that are actually present in the IR. */
function tokenGroups(tokens: Record<string, unknown>): Set<string> {
  const groups = new Set<string>();

  for (const [key, value] of Object.entries(tokens)) {
    const lower = key.toLowerCase();

    // Nested format: the top-level key IS the group name.
    if (typeof value === 'object' && value !== null && ALL_GROUPS.includes(lower)) {
      groups.add(lower);
      continue;
    }

    // Flat CSS custom property format: match by prefix.
    for (const [group, prefixes] of Object.entries(GROUP_PREFIXES)) {
      if (prefixes.some((p) => lower === p || lower.startsWith(`${p}-`) || lower.startsWith(`${p}/`))) {
        groups.add(group);
        break;
      }
    }
  }

  return groups;
}

/** One row from the attribution.md table: { group, source }. */
interface AttributionRow {
  group: string;
  source: string;
}

/**
 * Parse an attribution.md Markdown table.
 *
 * Expected format (header name is case-insensitive; leading/trailing whitespace ignored):
 *
 *   | Group | Source |
 *   |---|---|
 *   | color | linear-com.hero |
 *   | type  | theory/typography |
 */
function parseAttributionRows(md: string): AttributionRow[] {
  const rows: AttributionRow[] = [];
  for (const line of md.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
    if (cells.length < 2) continue;
    const [group, source] = cells as [string, string];
    if (!group || !source) continue;
    // Skip the header row and separator rows.
    if (group.toLowerCase() === 'group' || /^[-: ]+$/.test(group)) continue;
    rows.push({ group: group.toLowerCase(), source });
  }
  return rows;
}

/**
 * Verify that a row's source is a known reference: either a capture slug stored in
 * `.omd/refs/` or a theory-pack file referenced as `theory/<name>`.
 *
 * @param source    The source string from the attribution row.
 * @param captureNames  Slugs (filenames without .json) found in .omd/refs/.
 * @param theoryNames   Base names (without .md) of files in the theory pack.
 */
function isKnownSource(source: string, captureNames: string[], theoryNames: string[]): boolean {
  if (captureNames.includes(source)) return true;
  if (source.startsWith('theory/')) {
    const name = source.slice('theory/'.length);
    return theoryNames.includes(name);
  }
  return false;
}

/**
 * Attribution audit — the deterministic complement to the attribution.md prompt contract.
 *
 * Only called when `.omd/attribution.md` exists (the caller is responsible for that guard).
 *
 * Two violation codes:
 *
 *   ATTR-MISSING         A token group is present on the page but has no row in
 *                        attribution.md. The designer borrowed a token family and did not
 *                        say where it came from.
 *
 *   ATTR-UNKNOWN-SOURCE  A row's source is neither a capture name in .omd/refs/ nor a
 *                        theory/<name> reference. The attribution points to something the
 *                        tool cannot verify — a typo, a deleted reference, or a free-form
 *                        note that slipped in where a slug belongs.
 */
export function checkAttribution(
  ir: Ir,
  attributionMd: string,
  captureNames: string[],
  theoryNames: string[],
): Violation[] {
  const violations: Violation[] = [];
  const rows = parseAttributionRows(attributionMd);
  const attributedGroups = new Set(rows.map((r) => r.group));
  const presentGroups = tokenGroups((ir.tokens ?? {}) as Record<string, unknown>);

  // ATTR-MISSING: token group on the page, no row in attribution.md.
  for (const group of [...presentGroups].sort()) {
    if (attributedGroups.has(group)) continue;
    violations.push({
      id: 'ATTR-MISSING',
      severity: 'warn',
      layer: 1,
      category: 'system',
      nodeId: 'page',
      path: 'attribution',
      value: group,
      message: `Token group "${group}" is used on this page but has no row in .omd/attribution.md. Record where this ${group} system came from before the decision disappears.`,
    });
  }

  // ATTR-UNKNOWN-SOURCE: row exists, but the source cannot be verified.
  for (const { group, source } of rows) {
    if (isKnownSource(source, captureNames, theoryNames)) continue;
    violations.push({
      id: 'ATTR-UNKNOWN-SOURCE',
      severity: 'warn',
      layer: 1,
      category: 'system',
      nodeId: 'page',
      path: 'attribution',
      value: `${group}: ${source}`,
      message: `Attribution row for "${group}" names source "${source}", which is neither a capture slug in .omd/refs/ nor a theory/<name> reference. Fix the slug or re-run omd ref add for that source.`,
    });
  }

  return violations;
}

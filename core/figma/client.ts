/**
 * Figma REST API client — F1 implementation.
 *
 * Two layers, kept strictly separate for testability:
 *   Pure layer  — parseFileKey, figmaColorToHex, normalizeNode, normalizeFile
 *   Fetch layer — fetchAndNormalize (uses global fetch, Node 22+)
 *
 * Endpoints used:
 *   GET /v1/files/:key?depth=2          enumerate pages + top-level frames
 *   GET /v1/files/:key/nodes?ids=...    per-frame full subtrees (batched ≤50)
 */
import type {
  FigmaFileResponse,
  FigmaNodesResponse,
  FigmaNode,
  FigmaPaint,
  FigmaEffect,
  SnapshotNode,
  SnapshotFill,
  SnapshotEffect,
  SnapshotPage,
  FigmaSnapshot,
} from './types.ts';

// ── URL parsing ───────────────────────────────────────────────────────────────

/**
 * Extract the Figma file key from any figma.com URL.
 *
 * Handles:
 *   https://www.figma.com/file/ABCDEF123/My-Design
 *   https://www.figma.com/design/ABCDEF123/My-Design?node-id=1%3A2
 *   figma.com/file/ABCDEF123
 *
 * Throws if the URL does not contain a recognisable /file/:key or /design/:key
 * path segment.
 */
export function parseFileKey(url: string): string {
  let href = url.trim();
  if (!href.startsWith('http://') && !href.startsWith('https://')) {
    href = `https://${href}`;
  }

  let pathname: string;
  try {
    pathname = new URL(href).pathname;
  } catch {
    throw new Error(`Invalid Figma URL: ${url}`);
  }

  const match = pathname.match(/\/(file|design)\/([A-Za-z0-9_-]+)/);
  if (!match || !match[2]) {
    throw new Error(`Could not extract file key from Figma URL: ${url}`);
  }
  return match[2];
}

// ── Color utilities ───────────────────────────────────────────────────────────

/**
 * Convert a Figma RGBA color (channel values in [0, 1]) to a #RRGGBB hex string.
 * Alpha is dropped — fills use opacity at the paint level.
 */
export function figmaColorToHex(c: { r: number; g: number; b: number }): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ── Node normalization (pure) ─────────────────────────────────────────────────

function normalizeFill(paint: FigmaPaint): SnapshotFill | null {
  if (paint.visible === false) return null;
  if (paint.type === 'SOLID' && paint.color) {
    return { type: 'solid', hex: figmaColorToHex(paint.color) };
  }
  if (paint.type.startsWith('GRADIENT') && paint.gradientStops) {
    const stops = paint.gradientStops
      .map((s) => `${figmaColorToHex(s.color)} ${Math.round(s.position * 100)}%`)
      .join(', ');
    const gradType = paint.type === 'GRADIENT_RADIAL' ? 'radial-gradient' : 'linear-gradient';
    return { type: paint.type.toLowerCase(), gradient: `${gradType}(${stops})` };
  }
  return { type: paint.type.toLowerCase() };
}

function normalizeEffect(effect: FigmaEffect): SnapshotEffect | null {
  if (effect.visible === false) return null;
  const base: SnapshotEffect = { type: effect.type.toLowerCase() };
  if (effect.color !== undefined) base.color = figmaColorToHex(effect.color);
  if (effect.offset !== undefined) {
    base.offsetX = effect.offset.x;
    base.offsetY = effect.offset.y;
  }
  if (effect.radius !== undefined) base.radius = effect.radius;
  return base;
}

/**
 * Normalize a single Figma API node into a SnapshotNode.
 * Pure — no I/O.
 *
 * @param node          Raw node from the Figma API.
 * @param compSetLookup Map of componentNodeId → componentSetId, built from
 *                      the file-level `components` map. Pass an empty object
 *                      when not available.
 */
export function normalizeNode(
  node: FigmaNode,
  compSetLookup: Readonly<Record<string, string>> = {},
): SnapshotNode {
  const fills: SnapshotFill[] = (node.fills ?? [])
    .map(normalizeFill)
    .filter((f): f is SnapshotFill => f !== null);

  const effects: SnapshotEffect[] = (node.effects ?? [])
    .map(normalizeEffect)
    .filter((e): e is SnapshotEffect => e !== null);

  const result: SnapshotNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    fills,
    effects,
  };

  if (node.absoluteBoundingBox !== undefined) {
    result.absoluteBoundingBox = node.absoluteBoundingBox;
  }
  if (node.cornerRadius !== undefined) result.cornerRadius = node.cornerRadius;

  // Typography (TEXT nodes carry a `style` object)
  if (node.style?.fontFamily) {
    const s = node.style;
    let lineHeight = 1.2;
    if (s.lineHeightPx !== undefined && s.fontSize !== undefined && s.fontSize > 0) {
      lineHeight = Math.round((s.lineHeightPx / s.fontSize) * 100) / 100;
    }
    result.typography = {
      fontFamily: s.fontFamily!,
      fontSize: s.fontSize ?? 16,
      fontWeight: s.fontWeight ?? 400,
      lineHeight,
    };
  }

  // Auto-layout
  if (node.layoutMode !== undefined && node.layoutMode !== 'NONE') {
    result.layoutMode = node.layoutMode as 'HORIZONTAL' | 'VERTICAL';
    if (node.itemSpacing !== undefined) result.itemSpacing = node.itemSpacing;
    result.padding = [
      node.paddingTop ?? 0,
      node.paddingRight ?? 0,
      node.paddingBottom ?? 0,
      node.paddingLeft ?? 0,
    ];
  }

  // Component set membership
  const setId = compSetLookup[node.id];
  if (setId !== undefined) result.componentSetId = setId;

  return result;
}

/**
 * Recursively walk a frame node and collect it plus all descendants as
 * SnapshotNodes. Including the root itself ensures the frame's own fills,
 * effects, and layout properties are available for token extraction.
 */
function collectNodes(
  node: FigmaNode,
  compSetLookup: Readonly<Record<string, string>>,
): SnapshotNode[] {
  const out: SnapshotNode[] = [];
  function walk(n: FigmaNode): void {
    out.push(normalizeNode(n, compSetLookup));
    for (const child of n.children ?? []) walk(child);
  }
  walk(node);
  return out;
}

/**
 * Normalize a full Figma file API response into a FigmaSnapshot.
 * Pure — no I/O.
 *
 * @param fileKey     The Figma file key.
 * @param response    Full or depth-limited file response.
 * @param extraNodes  Map of frame/node IDs to their fully-fetched FigmaNode,
 *                    used to replace the shallow stubs in `response`. Optional.
 */
export function normalizeFile(
  fileKey: string,
  response: FigmaFileResponse,
  extraNodes: Readonly<Record<string, FigmaNode>> = {},
): FigmaSnapshot {
  // Build compSetLookup: componentNodeId → componentSetId
  const compSetLookup: Record<string, string> = {};
  for (const [id, comp] of Object.entries(response.components ?? {})) {
    if (comp.componentSetId !== undefined) compSetLookup[id] = comp.componentSetId;
  }

  // Build componentSets index (seed from file-level metadata)
  const componentSets: FigmaSnapshot['componentSets'] = {};
  for (const [id, cs] of Object.entries(response.componentSets ?? {})) {
    componentSets[id] = { id, name: cs.name, variants: [] };
  }
  // Populate variants from the components map
  for (const [id, comp] of Object.entries(response.components ?? {})) {
    if (comp.componentSetId !== undefined) {
      const entry = componentSets[comp.componentSetId];
      if (entry !== undefined) {
        entry.variants.push({ componentId: id, name: comp.name });
      }
    }
  }

  // Walk document: DOCUMENT → CANVAS (page) → top-level frames
  const pages: SnapshotPage[] = [];
  for (const page of response.document.children ?? []) {
    if (page.type !== 'CANVAS') continue;
    const frames = [];
    for (const child of page.children ?? []) {
      const frameTypes = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'GROUP', 'SECTION']);
      if (!frameTypes.has(child.type)) continue;
      // Prefer the full subtree from extraNodes if available
      const nodeData = extraNodes[child.id] ?? child;
      frames.push({
        id: child.id,
        name: nodeData.name,
        nodes: collectNodes(nodeData, compSetLookup),
      });
    }
    pages.push({ id: page.id, name: page.name, frames });
  }

  return {
    fileKey,
    fileName: response.name,
    capturedAt: new Date().toISOString(),
    pages,
    componentSets,
  };
}

// ── Fetch layer ───────────────────────────────────────────────────────────────

const FIGMA_BASE = 'https://api.figma.com';

async function figmaFetch(path: string, token: string): Promise<unknown> {
  const url = `${FIGMA_BASE}${path}`;
  let res = await fetch(url, { headers: { 'X-Figma-Token': token } });

  // Respect rate-limit: retry once after Retry-After seconds
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '10', 10);
    await new Promise<void>((resolve) => setTimeout(resolve, (retryAfter || 10) * 1000));
    res = await fetch(url, { headers: { 'X-Figma-Token': token } });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Figma API ${res.status} for ${path}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Fetch a Figma file and return a normalized snapshot.
 *
 * Strategy:
 *   1. GET /v1/files/:key?depth=2 — get pages + top-level frame list without
 *      full subtrees (avoids huge payloads on large files).
 *   2. GET /v1/files/:key/nodes?ids=... — fetch full subtrees per frame,
 *      in batches of ≤50 IDs.
 * Then normalizeFile merges both into a FigmaSnapshot.
 */
export async function fetchAndNormalize(fileKey: string, token: string): Promise<FigmaSnapshot> {
  // Step 1: shallow fetch to enumerate pages and frame IDs
  const shallow = (await figmaFetch(`/v1/files/${fileKey}?depth=2`, token)) as FigmaFileResponse;

  // Collect top-level frame IDs from all pages
  const frameIds: string[] = [];
  const frameTypes = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'GROUP', 'SECTION']);
  for (const page of shallow.document.children ?? []) {
    if (page.type !== 'CANVAS') continue;
    for (const child of page.children ?? []) {
      if (frameTypes.has(child.type)) frameIds.push(child.id);
    }
  }

  // Step 2: fetch full subtrees in batches of ≤50
  const extraNodes: Record<string, FigmaNode> = {};
  const BATCH = 50;
  for (let i = 0; i < frameIds.length; i += BATCH) {
    const batch = frameIds.slice(i, i + BATCH);
    const ids = batch.map(encodeURIComponent).join(',');
    const nodesRes = (await figmaFetch(
      `/v1/files/${fileKey}/nodes?ids=${ids}`,
      token,
    )) as FigmaNodesResponse;
    for (const [id, data] of Object.entries(nodesRes.nodes)) {
      if (data?.document !== undefined) extraNodes[id] = data.document;
    }
  }

  return normalizeFile(fileKey, shallow, extraNodes);
}

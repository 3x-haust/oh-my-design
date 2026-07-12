/**
 * Types for the Figma REST API (minimal subset) and the normalized snapshot
 * stored at .omd/figma/snapshot.json.
 */

// ── Raw Figma API shapes ──────────────────────────────────────────────────────

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaColorStop {
  color: FigmaColor;
  position: number;
}

export interface FigmaPaint {
  type: string; // 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | ...
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  gradientStops?: FigmaColorStop[];
}

export interface FigmaEffect {
  type: string; // 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | ...
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  lineHeightUnit?: string;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: FigmaPaint[];
  effects?: FigmaEffect[];
  cornerRadius?: number;
  style?: FigmaTypeStyle;
  layoutMode?: string; // 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
}

export interface FigmaComponentMeta {
  key?: string;
  name: string;
  description?: string;
  componentSetId?: string;
}

export interface FigmaComponentSetMeta {
  key?: string;
  name: string;
  description?: string;
}

export interface FigmaFileResponse {
  name: string;
  document: FigmaNode;
  styles?: Record<string, { name: string; styleType: string }>;
  components?: Record<string, FigmaComponentMeta>;
  componentSets?: Record<string, FigmaComponentSetMeta>;
}

export interface FigmaNodesResponse {
  nodes: Record<string, { document: FigmaNode } | null>;
}

// ── Normalized snapshot ───────────────────────────────────────────────────────

export interface SnapshotFill {
  type: string;
  /** Solid color as #RRGGBB */
  hex?: string;
  /** Gradient description string for gradient fills */
  gradient?: string;
}

export interface SnapshotEffect {
  type: string;
  /** Shadow color as #RRGGBB */
  color?: string;
  offsetX?: number;
  offsetY?: number;
  radius?: number;
}

export interface SnapshotTypography {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  /** Line height as ratio to font-size, e.g. 1.5 */
  lineHeight: number;
}

export interface SnapshotNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills: SnapshotFill[];
  effects: SnapshotEffect[];
  typography?: SnapshotTypography;
  cornerRadius?: number;
  layoutMode?: 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  /** top, right, bottom, left */
  padding?: [number, number, number, number];
  /** Present when this node belongs to a component set */
  componentSetId?: string;
}

export interface SnapshotFrame {
  id: string;
  name: string;
  nodes: SnapshotNode[];
}

export interface SnapshotPage {
  id: string;
  name: string;
  frames: SnapshotFrame[];
}

export interface ComponentSetInfo {
  id: string;
  name: string;
  /** Component node IDs belonging to this set */
  variants: Array<{ componentId: string; name: string }>;
}

// ── Responsive matching ───────────────────────────────────────────────────────

/** Viewport band derived from frame width. */
export type Band = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/** One viewport variant within a responsive breakpoint set. */
export interface FigmaResponsiveVariant {
  frameId: string;
  name: string;
  width: number;
  band: Band;
}

/** A group of frames that are viewport variants of the same screen. */
export interface FigmaBreakpointSet {
  screen: string;
  variants: FigmaResponsiveVariant[];
}

export interface FigmaSnapshot {
  fileKey: string;
  fileName: string;
  capturedAt: string;
  pages: SnapshotPage[];
  componentSets: Record<string, ComponentSetInfo>;
  /**
   * Responsive frame groupings computed by `matchResponsiveFrames`.
   * Populated after `omd figma pull` and stored in the snapshot for the skill.
   */
  responsive?: {
    breakpointSets: FigmaBreakpointSet[];
    /** Frames that did not match any viewport-variant group, honestly labeled. */
    unmatched: FigmaResponsiveVariant[];
  };
}

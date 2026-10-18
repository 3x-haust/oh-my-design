import { relative } from 'node:path';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { onPage, withBrowser, type Viewport } from '../render/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { SnapshotFill, SnapshotFrame, SnapshotNode } from './types.ts';
import {
  FIGMA_FACT_TEXT_LIMIT,
  MAX_FIGMA_REGION_FACTS,
  MAX_RENDERED_PAGE_ELEMENTS,
  type FigmaCompareBox,
  type FigmaNodeFact,
  type RenderedElementFact,
} from './compare-types.ts';

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
const truncate = (value: string): string => value.replaceAll(/\s+/gu, ' ').trim().slice(0, FIGMA_FACT_TEXT_LIMIT);

function intersects(left: FigmaCompareBox, right: FigmaCompareBox): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x
    && left.y < right.y + right.height && left.y + left.height > right.y;
}

function fillValues(fills: readonly SnapshotFill[] | undefined): readonly string[] {
  return (fills ?? []).map(fill => fill.hex ?? fill.gradient ?? fill.type);
}

function localNodeFact(node: SnapshotNode, origin: FigmaCompareBox): FigmaNodeFact | null {
  const source = node.absoluteBoundingBox;
  if (source === undefined) return null;
  return {
    id: node.id, name: node.name, type: node.type,
    box: { x: round4(source.x - origin.x), y: round4(source.y - origin.y),
      width: round4(source.width), height: round4(source.height) },
    fillColors: fillValues(node.fills),
    stroke: { colors: fillValues(node.strokes), weight: node.strokeWeight ?? null },
    cornerRadius: node.cornerRadius ?? null,
    typography: node.typography === undefined ? null : {
      family: node.typography.fontFamily, weight: node.typography.fontWeight,
      size: node.typography.fontSize, lineHeight: node.typography.lineHeightPx ?? node.typography.lineHeight,
      letterSpacing: node.typography.letterSpacing ?? 0,
    },
    text: truncate(node.characters ?? ''),
  };
}

export function renderedElementsInRegion(
  elements: readonly RenderedElementFact[],
  region: FigmaCompareBox,
): readonly RenderedElementFact[] {
  return elements.filter(element => intersects(element.box, region)).slice(0, MAX_FIGMA_REGION_FACTS);
}

export function figmaNodesInRegion(frame: SnapshotFrame, region: FigmaCompareBox): readonly FigmaNodeFact[] {
  const origin = frame.nodes[0]?.absoluteBoundingBox;
  if (origin === undefined) return [];
  return frame.nodes.map(node => localNodeFact(node, origin))
    .filter((node): node is FigmaNodeFact => node !== null && intersects(node.box, region))
    .slice(0, MAX_FIGMA_REGION_FACTS);
}

export async function collectRenderedElementFacts(
  page: import('playwright').Page,
): Promise<readonly RenderedElementFact[]> {
  return page.evaluate(browserCallback((input: { limit: number; textLimit: number }) => {
    const shortText = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, input.textLimit);
    const selector = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const segments: string[] = [];
      let current: Element | null = element;
      while (current !== null && current !== document.documentElement && segments.length < 6) {
        const tag = current.tagName.toLowerCase();
        const currentTag = current.tagName;
        const parent: Element | null = current.parentElement;
        if (parent === null) { segments.unshift(tag); break; }
        const children: Element[] = Array.from(parent.children);
        const siblings = children.filter(candidate => candidate.tagName === currentTag);
        const index = siblings.indexOf(current) + 1;
        segments.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
        current = parent;
      }
      return segments.join(' > ');
    };
    const facts: RenderedElementFact[] = [];
    for (const element of Array.from(document.body?.querySelectorAll('*') ?? [])) {
      if (facts.length >= input.limit) break;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width <= 0 || box.height <= 0 || box.right <= 0 || box.bottom <= 0
        || box.left >= innerWidth || box.top >= innerHeight || style.display === 'none'
        || style.visibility !== 'visible' || Number(style.opacity) === 0) continue;
      facts.push({
        tag: element.tagName.toLowerCase(), selector: selector(element),
        text: shortText((element as HTMLElement).innerText ?? element.textContent ?? ''),
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        styles: {
          fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
          lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, color: style.color,
          backgroundColor: style.backgroundColor, border: style.border, borderRadius: style.borderRadius,
          padding: style.padding, gap: style.gap,
        },
      });
    }
    return facts;
  }), { limit: MAX_RENDERED_PAGE_ELEMENTS, textLimit: FIGMA_FACT_TEXT_LIMIT });
}

export async function renderFigmaPage(
  target: string,
  input: Readonly<{ viewport: Viewport; out: string; adapter: ProjectWriteAdapter }>,
): Promise<Readonly<{ path: string; elements: readonly RenderedElementFact[] }>> {
  return withBrowser(browser => onPage(browser, target, input.viewport, async page => {
    const elements = await collectRenderedElementFacts(page);
    input.adapter.write(relative(input.adapter.projectRoot, input.out),
      await page.screenshot({ fullPage: false }));
    return { path: input.out, elements };
  }));
}

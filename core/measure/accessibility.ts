import type { Page } from 'playwright';
import type { MeasurementDom, MetricValues } from './types.ts';

type AriaSnapshotNode = { role?: unknown; name?: unknown };

function snapshotRoot(value: unknown): AriaSnapshotNode {
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'object' || value[0] === null) return {};
  return value[0] as AriaSnapshotNode;
}

/**
 * Playwright delegates this snapshot to Chromium's accessibility implementation, so the
 * name is not reconstructed from a repository-owned subset of the AccName algorithm.
 */
export async function attachFormAccessibility(page: Page, dom: MeasurementDom): Promise<MeasurementDom> {
  const controls = dom.nodes.filter(node => node.visibleBox && ['input', 'select', 'textarea'].includes(node.tag));
  const accessibility = await Promise.all(controls.map(async node => {
    const locator = page.locator(node.locator.replace(/^top>/, ''));
    const [snapshot, semantics] = await Promise.all([
      locator.ariaSnapshotJSON({ depth: 0 }),
      locator.evaluate(element => {
        const field = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const labelledBy = (element.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/).filter(Boolean)
          .map(id => document.getElementById(id)?.textContent?.trim() ?? '').some(Boolean);
        const persistentName = Boolean(
          Array.from(field.labels ?? []).some(label => label.textContent?.trim())
          || element.getAttribute('aria-label')?.trim()
          || labelledBy
          || element.getAttribute('title')?.trim()
          || element instanceof HTMLInputElement && element.type === 'image' && element.alt.trim()
        );
        return { placeholder: element.getAttribute('placeholder'), persistentName };
      }),
    ]);
    const root = snapshotRoot(snapshot);
    return {
      subjectId: node.id,
      role: typeof root.role === 'string' ? root.role : '',
      name: typeof root.name === 'string' ? root.name.trim() : '',
      placeholder: semantics.placeholder,
      persistentName: semantics.persistentName,
    };
  }));
  return { ...dom, accessibility };
}

export function controlAccessibility(dom: MeasurementDom): MetricValues['control-accessibility'] {
  return { controls: dom.accessibility.map(control => {
    const issue = control.name.length === 0 ? 'missing-name'
      : control.placeholder !== null && control.placeholder.trim().length > 0
        && control.name === control.placeholder.trim() && !control.persistentName ? 'placeholder-only'
        : 'none';
    return { ...control, issue };
  }) };
}

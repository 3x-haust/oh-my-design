import { join } from 'node:path';
import {
  designerCaseCatalog, designerCaseIndexMessage, designerCaseRoot, loadDesignerCase, DesignerCaseError,
} from '../core/cases/index.ts';
import { canonicalJson } from '../core/ref/canonical-json.ts';

export type DesignerCasePart =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'image'; data: string; mimeType: string }>;

export function designerCaseToolContext(
  runtimeRoot: string, args: readonly string[], stdout: string,
): readonly DesignerCasePart[] {
  const root = designerCaseRoot(join(runtimeRoot, 'core/cases'));
  if (args[0] === 'route' && args[1] === 'classify') {
    let value: unknown;
    try { value = JSON.parse(stdout); }
    catch (error) { if (error instanceof SyntaxError) return []; throw error; }
    // A public install carries no private originals; do not advertise an empty library.
    return typeof value === 'object' && value !== null
      && Reflect.get(value, 'schema') === 'adaptive-design-route-v1'
      && designerCaseCatalog(root).cases.length > 0
      ? [{ type: 'text', text: designerCaseIndexMessage(root) }] : [];
  }
  if (args[0] !== 'pack' || !args[1]?.startsWith('cases/')) return [];
  const opened = loadDesignerCase(args[1].slice('cases/'.length), root);
  const value: unknown = JSON.parse(stdout);
  if (canonicalJson(value) !== canonicalJson(opened.case)) throw new DesignerCaseError('case output drift');
  return opened.renders.flatMap<DesignerCasePart>(({ pngBase64, path: _path, ...frame }) => [
    { type: 'text', text: JSON.stringify(frame) },
    { type: 'image', data: pngBase64, mimeType: 'image/png' },
  ]);
}

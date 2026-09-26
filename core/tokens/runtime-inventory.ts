import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { withBrowser } from '../render/index.ts';
import { withLocalView, stateObject, stateText } from '../render/stateful.ts';
import { MAX_INSPECTION_VIEWS } from '../render/view-capacity.ts';
import { parseSlopScope } from '../slop/review.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { listProductionSourceFiles } from '../source-seal/index.ts';
import { readStableProjectFile, nodeStableProjectFileSystem } from '../runtime/stable-project-file.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { decodePng } from '../motion/energy.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';

export const RUNTIME_INVENTORY_PATH = '.omd/runtime-design-system.json';
export const RUNTIME_INVENTORY_DOC = '.omd/runtime-design-system.md';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const read = (root: string, path: string) => readStableProjectFile({ root: resolve(root), path: resolve(root, path), label: path, fs: nodeStableProjectFileSystem() });
const sourceSha = (root: string) => hash(canonicalJson(listProductionSourceFiles(root).map(path => ({ path, sha256: hash(read(root, path)) }))));
const PROPERTIES = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'border-radius', 'border-color', 'border-width', 'box-shadow', 'display', 'opacity', 'width', 'height'];
const fail = (message: string): never => { throw new Error(`RUNTIME_DESIGN_INVENTORY: ${message}`); };

export function parseRuntimeInventoryInput(value: unknown) {
  const input = stateObject(value, ['schema', 'views']);
  if (input.schema !== 'runtime-design-inventory-input-v1' || !Array.isArray(input.views) || !input.views.length || input.views.length > MAX_INSPECTION_VIEWS) return fail('schema/views invalid');
  const views = input.views.map(value => {
    const row = stateObject(value, ['id', 'page', 'viewport', 'selectors', ...(value && Object.hasOwn(value, 'state') ? ['state'] : [])]);
    if (!Array.isArray(row.selectors) || !row.selectors.length || row.selectors.length > 32) return fail('selectors need 1–32 named component targets');
    const selectors = row.selectors.map(value => { const item = stateObject(value, ['id', 'selector']); return { id: stateText(item.id), selector: stateText(item.selector) }; });
    if (new Set(selectors.map(item => item.id)).size !== selectors.length) return fail('duplicate component id');
    const { selectors: _selectors, ...scope } = row;
    return { ...parseSlopScope({ schema: 'slop-scope-v1', views: [scope] })[0]!, selectors };
  });
  if (new Set(views.map(view => view.id)).size !== views.length) return fail('duplicate view id');
  return { schema: 'runtime-design-inventory-input-v1' as const, views };
}

function markdown(record: { views: { id: string; components: { id: string; selector: string; styles: Record<string, string>; variables: Record<string, string> }[] }[] }) {
  const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ').replace(/</g, '&lt;');
  return ['# Runtime design inventory — observed, not approved', '',
    'Computed browser values include CSS-in-JS and utility classes for the declared states only. They do not identify authored semantic token names or unvisited variants. Approved tokens remain untouched.', '',
    ...record.views.flatMap(view => [`## ${cell(view.id)}`, '', ...view.components.flatMap(component => [`### ${cell(component.id)} — ${cell(component.selector)}`, '', '| Property | Computed value |', '| --- | --- |',
      ...Object.entries({ ...component.styles, ...component.variables }).map(([name, value]) => `| ${cell(name)} | ${cell(value)} |`), ''])]), ''].join('\n');
}

export function runtimeInventoryStatus(root: string): { status: 'missing' | 'current' | 'stale' | 'invalid'; path: string } {
  if (!existsSync(resolve(root, RUNTIME_INVENTORY_PATH))) return { status: 'missing', path: RUNTIME_INVENTORY_PATH };
  try {
    const bytes = read(root, RUNTIME_INVENTORY_PATH);
    const { digest, ...record } = JSON.parse(bytes.toString('utf8'));
    if (record.schema !== 'runtime-design-inventory-v1' || !/^[a-f0-9]{64}$/.test(digest) || hash(canonicalJson(record)) !== digest
      || !bytes.equals(read(root, `.omd/runtime-design-system/records/${digest}.json`))) return { status: 'invalid', path: RUNTIME_INVENTORY_PATH };
    const { signature, ...native } = record;
    if (typeof signature !== 'string' || !verifyNativeObservation(root, 'runtime-inventory-v1', hash(canonicalJson(native)), signature)) return fail('native inventory signature invalid');
    const input = parseRuntimeInventoryInput(record.input);
    const pages = [...new Set(input.views.map(view => view.page))];
    if (!Array.isArray(record.builds) || record.builds.length !== pages.length
      || record.builds.some((build: { page: string }, index: number) => build.page !== pages[index])) return fail('build coverage changed');
    if (sourceSha(root) !== record.sourceSha256 || record.builds.some((item: { page: string; sha256: string }) => servedProjectTreeSha256(root, item.page) !== item.sha256)
      || read(root, RUNTIME_INVENTORY_DOC).toString('utf8') !== markdown(record)) return { status: 'stale', path: RUNTIME_INVENTORY_PATH };
    if (record.views.length !== input.views.length) return fail('view coverage changed');
    for (const [index, view] of record.views.entries()) {
      const declared = input.views[index]!;
      if (view.id !== declared.id || !Array.isArray(view.components) || canonicalJson(view.components.map((component: { id: string; selector: string }) => ({ id: component.id, selector: component.selector }))) !== canonicalJson(declared.selectors)) return fail('component coverage changed');
      if (!/^[a-f0-9]{64}$/.test(view.capture.sha256) || view.capture.path !== `.omd/runtime-design-system/captures/${view.capture.sha256}.png`) return fail('unsafe capture');
      const png = read(root, view.capture.path);
      if (hash(png) !== view.capture.sha256) return fail('capture changed');
      const image = decodePng(png);
      if (image.width !== declared.viewport.width || image.height < declared.viewport.height) return fail('capture dimensions differ');
    }
    return { status: 'current', path: RUNTIME_INVENTORY_PATH };
  } catch { return { status: 'invalid', path: RUNTIME_INVENTORY_PATH }; }
}

export async function initializeRuntimeInventory(root: string, value: unknown, writer: ProjectWriteAdapter, refresh = false) {
  const input = parseRuntimeInventoryInput(value);
  if (existsSync(resolve(root, RUNTIME_INVENTORY_PATH)) && !refresh) {
    const previous = JSON.parse(read(root, RUNTIME_INVENTORY_PATH).toString('utf8'));
    if (runtimeInventoryStatus(root).status === 'current' && canonicalJson(previous.input) === canonicalJson(input)) return runtimeInventoryStatus(root);
    return fail('inventory changed; inspect and use init --input <runtime-input.json> --refresh');
  }
  const sourceSha256 = sourceSha(root);
  const builds = [...new Set(input.views.map(view => view.page))].map(page => ({ page, sha256: servedProjectTreeSha256(root, page) }));
  const views = await withBrowser(async browser => {
    const result = [];
    for (const view of input.views) result.push(await withLocalView(browser, root, view, async page => {
      const components = [];
      for (const item of view.selectors) {
        const element = page.locator(item.selector);
        if (await element.count() !== 1 || !await element.isVisible()) return fail(`component ${item.id} must name exactly one visible element`);
        const observed = await element.evaluate((node, properties) => {
          const computed = getComputedStyle(node);
          return { styles: Object.fromEntries(properties.map(property => [property, computed.getPropertyValue(property)])),
            variables: Object.fromEntries(Array.from(computed).filter(name => name.startsWith('--')).map(name => [name, computed.getPropertyValue(name).trim()])) };
        }, PROPERTIES);
        components.push({ ...item, ...observed });
      }
      const png = await page.screenshot({ fullPage: true, timeout: 5000 });
      const capture = { path: `.omd/runtime-design-system/captures/${hash(png)}.png`, sha256: hash(png) };
      writer.writeContentAddressed(capture.path, png);
      return { id: view.id, components, capture };
    }));
    return result;
  });
  if (sourceSha256 !== sourceSha(root) || builds.some(build => build.sha256 !== servedProjectTreeSha256(root, build.page))) return fail('source/build changed during inspection');
  const native = { schema: 'runtime-design-inventory-v1', authority: 'observed-not-approved', input, sourceSha256, builds, views };
  const record = { ...native, signature: signNativeObservation(root, 'runtime-inventory-v1', hash(canonicalJson(native))) };
  const digest = hash(canonicalJson(record));
  const bytes = `${JSON.stringify({ ...record, digest }, null, 2)}\n`;
  writer.writeContentAddressed(`.omd/runtime-design-system/records/${digest}.json`, bytes);
  writer.write(RUNTIME_INVENTORY_DOC, markdown(record));
  writer.write(RUNTIME_INVENTORY_PATH, bytes);
  return runtimeInventoryStatus(root);
}

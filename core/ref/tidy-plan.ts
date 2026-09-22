import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { decodePng } from '../motion/energy.ts';
import { inspectDesignReferenceAdmission } from './design-admission.ts';
import { readSearchExecution } from './search-execution.ts';
import { loadRefs, refRecordPath } from './store.ts';
import { readTidyFile, ReferenceTidyError, requireTidyDigest, tidyDirectory, tidyJson, tidyObject } from './tidy-files.ts';
import type { TidyCandidate, TidyFile } from './tidy-files.ts';

const retainedImage = (root: string, path: string): string | null => {
  const normalized = relative(resolve(root), resolve(root, path));
  return /^\.omd\/refs\/(?:[^/]+\.png|(?:design|domain)\/[^/]+\.png)$/.test(normalized) ? normalized : null;
};

/** Select only recognized diagnostics or a loaded reference's exact archival record. */
export function referenceTidyCandidates(root: string): readonly TidyCandidate[] {
  const files = ['.omd/refs', '.omd/refs/design', '.omd/refs/domain', '.omd/refs/design/navigation', '.omd/refs/domain/navigation']
    .flatMap(directory => tidyDirectory(root, directory));
  const records = new Map(files.filter(path => path.endsWith('.json')).map(path => [path, readTidyFile(root, path)]));
  const references = loadRefs(root, { includeDomain: true });
  const decisions = references.map(reference => ({ reference,
    admission: reference.researchLane === 'domain' ? null : inspectDesignReferenceAdmission(root, reference, { references }),
    discoveryAdmission: reference.researchLane === 'domain' ? null
      : inspectDesignReferenceAdmission(root, reference, { references, purpose: 'discovery' }),
  }));
  const protectedImages = new Set(decisions.filter(item => item.admission === null || item.admission.eligible || item.discoveryAdmission?.eligible)
    .flatMap(item => item.reference.imagePath ? [relative(resolve(root), resolve(root, item.reference.imagePath))] : []));
  // Unknown/duplicate records also retain ownership of an image; tidy does not interpret them.
  const loadedPaths = new Set(references.map(reference => relative(resolve(root), refRecordPath(root, reference))));
  for (const [path, file] of records) {
    const raw = tidyJson(file);
    if (!loadedPaths.has(path) && tidyObject(raw) && typeof raw.imagePath === 'string'
      && raw.schema !== 'reference-navigation-capture-v1') protectedImages.add(relative(resolve(root), resolve(root, raw.imagePath)));
  }
  const candidates = new Map<string, TidyCandidate>();
  const select = (file: TidyFile, reason: string): void => { candidates.set(file.path, { ...file, reason }); };
  for (const path of files) {
    const match = /^\.omd\/refs\/(?:design|domain)\/search-([a-f0-9]{64})\.png$/.exec(path);
    const expected = match?.[1];
    if (!expected) continue;
    const image = readTidyFile(root, path);
    requireTidyDigest(image, expected);
    const dimensions = decodePng(image.bytes);
    if (dimensions.width !== 1280 || dimensions.height !== 900) throw new ReferenceTidyError(`${path} search capture viewport differs`);
    if (!protectedImages.has(path)) select(image, 'legacy-search-capture');
  }
  for (const [path, file] of records) {
    const match = /^\.omd\/refs\/(design|domain)\/search-([a-f0-9]{64})\.json$/.exec(path);
    const lane = match?.[1]; const sha256 = match?.[2];
    if ((lane === 'design' || lane === 'domain') && sha256) {
      const execution = readSearchExecution(root, { path, sha256 }, lane);
      requireTidyDigest(file, sha256);
      select(file, 'legacy-search-diagnostic');
      if (execution.capture && /^\.omd\/refs\/(design|domain)\/search-[a-f0-9]{64}\.png$/.test(execution.capture.path)
        && !protectedImages.has(execution.capture.path)) {
        const image = readTidyFile(root, execution.capture.path);
        requireTidyDigest(image, execution.capture.sha256); select(image, 'legacy-search-capture');
      }
    }
    const navigation = /^\.omd\/refs\/(design|domain)\/navigation\/([a-f0-9]{64})\.json$/.exec(path);
    if (navigation) {
      const raw = tidyJson(file);
      if (!tidyObject(raw) || raw.schema !== 'reference-navigation-capture-v1' || 'component' in raw) continue;
      const lane = navigation[1]; const digest = navigation[2];
      if (!digest || (lane !== 'design' && lane !== 'domain')) continue;
      requireTidyDigest(file, digest);
      if (raw.researchLane !== lane || typeof raw.source !== 'string' || raw.kind !== 'page'
        || typeof raw.imagePath !== 'string' || !raw.imagePath.startsWith(`.omd/refs/${lane}/navigation/`)
        || raw.imagePath.slice(`.omd/refs/${lane}/navigation/`.length).includes('/')
        || !raw.imagePath.endsWith('.png') || raw.imagePath.includes('\\')
        || !tidyObject(raw.acquisition) || typeof raw.acquisition.imageSha256 !== 'string') {
        throw new ReferenceTidyError(`${path} has an invalid navigation capture`);
      }
      const image = readTidyFile(root, raw.imagePath);
      requireTidyDigest(image, raw.acquisition.imageSha256); decodePng(image.bytes);
      select(file, 'legacy-navigation-diagnostic');
      if (!protectedImages.has(image.path)) select(image, 'legacy-navigation-capture');
    }
  }
  for (const { reference, admission, discoveryAdmission } of decisions) {
    if (admission === null || admission.eligible || discoveryAdmission?.eligible) continue;
    const path = relative(resolve(root), refRecordPath(root, reference));
    // The physical domain lane is never reclassified through a conflicting JSON label.
    if (path.startsWith('.omd/refs/domain/')) continue;
    const file = records.get(path);
    if (!file || candidates.has(path)) continue;
    select(file, `design-ineligible:${admission.code}: ${admission.reason}`);
    if (!reference.imagePath) continue;
    const image = retainedImage(root, reference.imagePath);
    if (image && !image.startsWith('.omd/refs/domain/') && !protectedImages.has(image) && existsSync(resolve(root, image))) {
      select(readTidyFile(root, image), `design-ineligible-image:${admission.code}`);
    }
  }
  return [...candidates.values()].sort((left, right) => left.path.localeCompare(right.path));
}

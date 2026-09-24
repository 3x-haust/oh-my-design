import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { designDiscoveryItemIdentity } from './design-discovery-sources.ts';
import { readStrictDiscoveryNavigation, type DiscoveryNavigationReceipt } from './discovery-record.ts';

export type ObservedGalleryItem = Readonly<{
  url: string;
  links: readonly string[];
  imagePath: string;
}>;

export function observedGalleryItems(root: string): readonly ObservedGalleryItem[] {
  const directory = '.omd/discovery/design/navigation';
  let files: string[];
  try { files = readdirSync(join(root, directory)); }
  catch { return []; }
  const items: ObservedGalleryItem[] = [];
  const projectRoot = resolve(root);
  const fs = nodeStableProjectFileSystem();
  for (const file of files) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
    try {
      const record: unknown = JSON.parse(readStableProjectFile({ root: projectRoot,
        path: join(projectRoot, directory, file), label: file, fs }).toString('utf8'));
      if (typeof record !== 'object' || record === null || !('source' in record)
        || !('acquisition' in record) || typeof record.source !== 'string'
        || typeof record.acquisition !== 'object' || record.acquisition === null
        || !('imageSha256' in record.acquisition)
        || typeof record.acquisition.imageSha256 !== 'string') continue;
      const item = designDiscoveryItemIdentity(record.source);
      if (item === null) continue;
      const sha256 = record.acquisition.imageSha256;
      const receipt: DiscoveryNavigationReceipt = {
        url: record.source,
        evidence: { path: `${directory}/${sha256}.png`, sha256 },
        capture: { path: `${directory}/${file}`, sha256: file.slice(0, -5) },
      };
      const observation = readStrictDiscoveryNavigation(root, receipt);
      if (designDiscoveryItemIdentity(observation.finalUrl) !== item) continue;
      items.push({ url: observation.url, links: observation.links, imagePath: receipt.evidence.path });
    } catch { continue; }
  }
  return items;
}

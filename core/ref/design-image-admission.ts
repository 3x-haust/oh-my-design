import { readFileSync } from 'node:fs';
import type { ImageFragmentProvenance } from './board-contract.ts';
import { ReferenceBoardResolutionError } from './board-contract.ts';
import { decodePng } from '../motion/energy.ts';
import { trustedReferenceImage } from './board-security.ts';
import { inspectDesignReferenceAdmission } from './design-admission.ts';
import { loadRefs } from './store.ts';

type ImageEvidence = Readonly<{ imagePath: string; provenance: ImageFragmentProvenance }>;
function matchesCapture(sourceBytes: Buffer, fragmentBytes: Buffer, crop: ImageFragmentProvenance['cropBox']): boolean {
  if (crop === undefined) return sourceBytes.equals(fragmentBytes);
  const source = decodePng(sourceBytes); const fragment = decodePng(fragmentBytes);
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger)
    || crop.x < 0 || crop.y < 0 || crop.width !== fragment.width || crop.height !== fragment.height
    || crop.x + crop.width > source.width || crop.y + crop.height > source.height) return false;
  for (let y = 0; y < fragment.height; y += 1) for (let x = 0; x < fragment.width; x += 1) {
    const sourceIndex = ((crop.y + y) * source.width + crop.x + x) * source.channels;
    const fragmentIndex = (y * fragment.width + x) * fragment.channels;
    for (let channel = 0; channel < 4; channel += 1) {
      const expected = channel < source.channels ? source.pixels[sourceIndex + channel] : 255;
      const actual = channel < fragment.channels ? fragment.pixels[fragmentIndex + channel] : 255;
      if (actual !== expected) return false;
    }
  }
  return true;
}

export function requireDesignImageAdmission(root: string, evidence: ImageEvidence): void {
  const references = loadRefs(root, { includeDomain: true });
  const fragmentBytes = readFileSync(trustedReferenceImage(root, evidence.imagePath));
  const matched = references.some(reference => {
    if (reference.source !== evidence.provenance.sourcePage || !reference.imagePath
      || !inspectDesignReferenceAdmission(root, reference, { references }).eligible) return false;
    return matchesCapture(readFileSync(trustedReferenceImage(root, reference.imagePath)), fragmentBytes, evidence.provenance.cropBox);
  });
  if (!matched) throw new ReferenceBoardResolutionError('FRAGMENT_SOURCE: retain the actual native design capture; the fragment must preserve its bytes or the exact declared pixel crop');
}

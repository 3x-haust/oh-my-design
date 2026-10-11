import { PNG } from 'pngjs';
import { createSourceStudyPacket, SourceStudyContractError } from '../../adapters/pi-study-contract.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { collectSelectedReferenceOriginals } from '../runtime/native-reference-fidelity.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { parseSourceStudyInput } from './source-study-input.ts';

/** Private author evidence. Public handoffs must use the resulting first-party files, not these packets. */
export function sourceStudyPackets(root: string, invocation: ProjectRunInvocation, value: unknown) {
  const input = parseSourceStudyInput(value);
  const route = readPersistedRoute(root, invocation);
  const originals = collectSelectedReferenceOriginals(root);
  if (!originals.length) throw new SourceStudyContractError('selected-visual-originals-required');
  const unique = [...new Map(originals.map(original => [original.sha256, original])).values()];
  const referenceRenders = unique.map((original, index) => {
    const image = PNG.sync.read(Buffer.from(original.pngBase64, 'base64'));
    return { sourceId: `reference-${index + 1}`, imageSha256: original.sha256,
      width: image.width, height: image.height, pngBase64: original.pngBase64 };
  });
  const source = {
    sourceContract: route.sourceContract,
    explorationReason: input.reason,
    variantCount: input.variants.length,
    referenceRoles: unique.map((original, index) => ({
      sourceId: `reference-${index + 1}`,
      parts: originals.filter(part => part.sha256 === original.sha256).map(part => ({
        targetComponent: part.targetComponent, take: part.take,
        avoid: part.avoid, adaptation: part.adaptation,
      })),
    })),
  };
  const packets = input.variants.map(variant => ({
    id: variant.id,
    bytes: createSourceStudyPacket({
      identity: invocation.current,
      evidence: {
        study: {
          source: canonicalJson(source), contentStatus: 'provisional',
          relationship: variant.relationship, observableConsequence: variant.observableConsequence,
          primaryAction: input.primaryAction,
          viewports: [
            { name: 'desktop', width: 1280, height: 900 },
            { name: 'mobile', width: 390, height: 844 },
          ],
        },
        destinationContent: input.destinationContent, referenceRenders,
      },
    }),
  }));
  return { input, packets, contextSha256: sha256(canonicalJson(packets.map(packet => ({
    id: packet.id, sha256: sha256(packet.bytes),
  })))) };
}

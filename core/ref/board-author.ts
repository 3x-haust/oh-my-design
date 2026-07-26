import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReferenceBoard } from './board-parser.ts';
import { REFERENCE_BOARD_SCHEMA_VERSION, type ReferenceBoardManifest } from './board-contract.ts';
import { refIdentity } from './identity.ts';
import { sha256 } from './board-artifacts.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const fail = (message: string): never => { throw new Error(`reference board input is invalid: ${message}`); };
const text = (value: unknown, path: string): string => typeof value === 'string' && value.trim() !== '' ? value : fail(`${path} must be a non-empty string`);
const list = (value: unknown, path: string): unknown[] => Array.isArray(value) ? value : fail(`${path} must be an array`);
const record = (value: unknown, path: string): Record<string, unknown> => isRecord(value) ? value : fail(`${path} must be an object`);
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[], path: string): void => {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) fail(`${path} has unknown keys: ${extras.join(', ')}`);
};

export function authorReferenceBoard(root: string, value: unknown): ReferenceBoardManifest {
  const rootInput = record(value, 'root');
  exactKeys(rootInput, ['candidates'], 'root');
  const candidates = list(rootInput.candidates, 'candidates');
  if (candidates.length < 2) fail('candidates must contain at least two independently assembled alternatives');

  const acquisition = JSON.parse(readFileSync(join(root, '.omd', 'acquisition-plan.json'), 'utf8')) as { zones?: { id?: unknown; required?: unknown }[] };
  const requiredZones = new Set((acquisition.zones ?? [])
    .filter((zone) => zone.required === true)
    .map((zone, index) => text(zone.id, `acquisition.zones[${index}].id`)));
  if (requiredZones.size === 0) fail('acquisition plan must declare at least one required zone');

  const manifest = {
    schemaVersion: REFERENCE_BOARD_SCHEMA_VERSION,
    frameSha256: sha256(readFileSync(join(root, '.omd', 'frame.md'))),
    candidates: candidates.map((candidateValue, candidateIndex) => {
      const candidate = record(candidateValue, `candidates[${candidateIndex}]`);
      exactKeys(candidate, ['id', 'label', 'route', 'rationale', 'pieces'], `candidates[${candidateIndex}]`);
      const pieces = list(candidate.pieces, `candidates[${candidateIndex}].pieces`).map((pieceValue, pieceIndex) => {
        const path = `candidates[${candidateIndex}].pieces[${pieceIndex}]`;
        const piece = record(pieceValue, path);
        exactKeys(piece, ['slotId', 'source', 'component', 'targetComponent', 'targetSelector', 'taskIds', 'reason', 'take', 'avoid', 'adaptation', 'grid', 'rights', 'signal', 'motionAxis'], path);
        const source = text(piece.source, `${path}.source`);
        const component = text(piece.component, `${path}.component`);
        return {
          slotId: text(piece.slotId, `${path}.slotId`),
          sourceKind: 'component-capture' as const,
          referenceId: refIdentity(source, component),
          targetComponent: text(piece.targetComponent, `${path}.targetComponent`),
          targetSelector: text(piece.targetSelector, `${path}.targetSelector`),
          taskIds: piece.taskIds === undefined ? [`zone-${text(piece.slotId, `${path}.slotId`)}`] : list(piece.taskIds, `${path}.taskIds`),
          reason: text(piece.reason, `${path}.reason`),
          take: list(piece.take, `${path}.take`),
          avoid: text(piece.avoid, `${path}.avoid`),
          adaptation: text(piece.adaptation, `${path}.adaptation`),
          grid: piece.grid,
          evidenceAxes: {
            rights: text(piece.rights, `${path}.rights`),
            signal: text(piece.signal, `${path}.signal`),
            staticAxis: 'available' as const,
            motionAxis: text(piece.motionAxis, `${path}.motionAxis`),
          },
        };
      });
      const slots = pieces.map((piece) => piece.slotId);
      if (new Set(slots).size !== slots.length) fail(`candidates[${candidateIndex}] repeats a slot`);
      const missing = [...requiredZones].filter((zone) => !slots.includes(zone));
      if (missing.length > 0) fail(`candidates[${candidateIndex}] does not cover required zones: ${missing.join(', ')}`);
      return {
        id: text(candidate.id, `candidates[${candidateIndex}].id`),
        label: text(candidate.label, `candidates[${candidateIndex}].label`),
        route: text(candidate.route, `candidates[${candidateIndex}].route`),
        rationale: text(candidate.rationale, `candidates[${candidateIndex}].rationale`),
        pieces,
      };
    }),
  };
  return parseReferenceBoard(manifest);
}

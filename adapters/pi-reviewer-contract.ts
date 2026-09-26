import { createHash } from 'node:crypto';

export const PI_REVIEWER_TOOL = 'read_reviewer_evidence';
export const PI_REVIEWER_EVENT_PREFIX = 'OMD_PI_REVIEWER_EVENT:';
export const PI_REVIEWER_BRIDGE_SCHEMA = 'omd-pi-reviewer-bridge-v1';
export type PiReviewerLane = 'blindLane' | 'fidelityLane' | 'protocolLane';
export type PiReviewerHostContext = Readonly<{
  nodePath: string; nodeSha256: string; cliPath: string; cliSha256: string;
  provider: string; model: string; thinkingLevel: string; parentSessionId: string;
}>;
export type PiReviewerBridge = Readonly<{
  schema: typeof PI_REVIEWER_BRIDGE_SCHEMA;
  nodePath: string; args: readonly string[]; configurationSha256: string;
  packetSha256: string; sessionId: string; provider: string; model: string; thinkingLevel: string;
}>;
export type PiEvidenceContent = Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'image'; data: string; mimeType: string }>;

export class PiReviewerError extends Error {
  override readonly name = 'PiReviewerError';
  readonly code: string;
  constructor(code: string) { super(`PI_REVIEWER_REJECTED:${code}`); this.code = code; }
}
export const piHash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export function piRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new PiReviewerError(label);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) result[key] = Reflect.get(value, key);
  return result;
}
export function piText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new PiReviewerError(label);
  return value;
}
export function piDigest(value: unknown, label: string): string {
  const text = piText(value, label);
  if (!/^[a-f0-9]{64}$/.test(text)) throw new PiReviewerError(label);
  return text;
}
export function piInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new PiReviewerError(label);
  return value;
}
export function piParse(value: string, label: string): unknown {
  try { return JSON.parse(value); }
  catch (error) { if (error instanceof SyntaxError) throw new PiReviewerError(label); throw error; }
}
export function parsePiReviewerBridge(value: unknown): PiReviewerBridge {
  const item = piRecord(value, 'bridge');
  if (item.schema !== PI_REVIEWER_BRIDGE_SCHEMA || !Array.isArray(item.args)
    || item.args.some(arg => typeof arg !== 'string') || item.args.length !== 21
    || Object.keys(item).sort().join(',') !== 'args,configurationSha256,model,nodePath,packetSha256,provider,schema,sessionId,thinkingLevel') {
    throw new PiReviewerError('bridge-shape');
  }
  return Object.freeze({ schema: PI_REVIEWER_BRIDGE_SCHEMA,
    nodePath: piText(item.nodePath, 'bridge-node'), args: Object.freeze(item.args.map(arg => piText(arg, 'bridge-argument'))),
    configurationSha256: piDigest(item.configurationSha256, 'bridge-configuration'),
    packetSha256: piDigest(item.packetSha256, 'bridge-packet'), sessionId: piText(item.sessionId, 'bridge-session'),
    provider: piText(item.provider, 'bridge-provider'), model: piText(item.model, 'bridge-model'),
    thinkingLevel: piText(item.thinkingLevel, 'bridge-thinking'),
  });
}
export function parsePiEvidenceContent(value: unknown): PiEvidenceContent[] {
  if (!Array.isArray(value) || value.length === 0) throw new PiReviewerError('evidence-content');
  return value.map(raw => {
    const item = piRecord(raw, 'evidence-part');
    switch (item.type) {
      case 'text': return { type: 'text', text: piText(item.text, 'evidence-text') };
      case 'image': return { type: 'image', data: piText(item.data, 'evidence-image'), mimeType: piText(item.mimeType, 'evidence-mime') };
      default: throw new PiReviewerError('evidence-part-type');
    }
  });
}

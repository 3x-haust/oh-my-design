import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/board-artifacts.ts';

export const TRUSTED_BROWSER_RECEIPT_SCHEMA = 'trusted-browser-receipt-v1' as const;

export type TrustedBrowserReceiptErrorCode =
  | 'MALFORMED_TRUSTED_BROWSER_RECEIPT';

export class TrustedBrowserReceiptError extends Error {
  readonly code: TrustedBrowserReceiptErrorCode;

  constructor(code: TrustedBrowserReceiptErrorCode) {
    super(code);
    this.name = 'TrustedBrowserReceiptError';
    this.code = code;
  }
}

export type TrustedBrowserCapture = Readonly<{
  path: string;
  sha256: string;
  width: number;
  height: number;
  outcomeRef?: string;
  testedUrl?: string;
}>;

export type TrustedBrowserReceipt = Readonly<{
  schema: typeof TRUSTED_BROWSER_RECEIPT_SCHEMA;
  runId: string;
  routeSha256: string;
  sourceContractSha256: string;
  activationBuildSha256: string;
  productionRevisionSha256: string;
  productionPath: string;
  testedUrl: string;
  decisionGraphSha256: string;
  outcomeResults: readonly Readonly<{
    outcomeRef: string;
    status: 'pass' | 'fail';
    findings: readonly string[];
  }>[];
  confirmedClaimRefs: readonly string[];
  decisionRefs: readonly string[];
  hardFloors: Readonly<{
    behavior: 'pass' | 'fail';
    access: 'pass' | 'fail';
    safety: 'pass' | 'fail';
  }>;
  captures: readonly TrustedBrowserCapture[];
  transcript: readonly string[];
  entrySurface?: Readonly<{
    benchmarkProjectionSha256: string;
    prerequisiteTaskId: string;
    dependentTaskId: string;
    status: 'pass' | 'fail';
  }>;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const TOP_KEYS = new Set([
  'schema', 'runId', 'routeSha256', 'sourceContractSha256', 'activationBuildSha256',
  'productionRevisionSha256', 'decisionGraphSha256', 'outcomeResults', 'confirmedClaimRefs',
  'decisionRefs', 'hardFloors', 'captures', 'transcript', 'productionPath',
  'testedUrl',
]);
const ENTRY_TOP_KEYS = new Set([...TOP_KEYS, 'entrySurface']);
const OUTCOME_KEYS = new Set(['outcomeRef', 'status', 'findings']);
const FLOOR_KEYS = new Set(['behavior', 'access', 'safety']);
const CAPTURE_KEYS = new Set(['path', 'sha256', 'width', 'height']);
const OUTCOME_CAPTURE_KEYS = new Set(['path', 'sha256', 'width', 'height', 'outcomeRef']);
const ENTRY_SURFACE_KEYS = new Set([
  'benchmarkProjectionSha256',
  'prerequisiteTaskId',
  'dependentTaskId',
  'status',
]);
const CODE = /^[a-z0-9]+(?:[-:][a-z0-9]+)*$/;
const TRANSCRIPT = /^(?:(?:action-click|action-fill|assertion-pass|assertion-fail):[a-f0-9]{64}|(?:access|safety)-finding:[a-z0-9]+(?:[-:][a-z0-9]+)*)$/;

function malformed(): never {
  throw new TrustedBrowserReceiptError('MALFORMED_TRUSTED_BROWSER_RECEIPT');
}

export function trustedBrowserReceiptSha256(receipt: TrustedBrowserReceipt): string {
  return createHash('sha256').update(canonicalJson(receipt)).digest('hex');
}

function record(value: unknown, keys: ReadonlySet<string>): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return malformed();
  }
  const item = value as Record<string, unknown>;
  const own = Reflect.ownKeys(item);
  if (own.length !== keys.size || own.some((key) => typeof key !== 'string' || !keys.has(key))) {
    return malformed();
  }
  return item;
}

function strings(value: unknown, pattern?: RegExp, unique = true, allowEmpty = false): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.some((item) => typeof item !== 'string' || item === '' || (pattern && !pattern.test(item)))) {
    return malformed();
  }
  const items = [...value] as string[];
  if (unique && new Set(items).size !== items.length) return malformed();
  return Object.freeze(items);
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return malformed();
  return value;
}

export function parseTrustedBrowserReceipt(input: unknown): TrustedBrowserReceipt {
  const candidate = input as Record<string, unknown> | null;
  const receipt = record(
    input,
    candidate !== null && typeof candidate === 'object'
      && Object.hasOwn(candidate, 'entrySurface')
      ? ENTRY_TOP_KEYS
      : TOP_KEYS,
  );
  if (receipt.schema !== TRUSTED_BROWSER_RECEIPT_SCHEMA
    || typeof receipt.runId !== 'string' || receipt.runId === ''
    || !Array.isArray(receipt.outcomeResults) || receipt.outcomeResults.length === 0
    || !Array.isArray(receipt.captures) || receipt.captures.length === 0) return malformed();
  const outcomeResults = receipt.outcomeResults.map((candidate) => {
    const outcome = record(candidate, OUTCOME_KEYS);
    if (typeof outcome.outcomeRef !== 'string' || outcome.outcomeRef === ''
      || (outcome.status !== 'pass' && outcome.status !== 'fail') || !Array.isArray(outcome.findings)
      || outcome.findings.some((finding) => typeof finding !== 'string' || !CODE.test(finding))
      || (outcome.status === 'pass' && outcome.findings.length !== 0)
      || (outcome.status === 'fail' && outcome.findings.length === 0)) return malformed();
    return Object.freeze({
      outcomeRef: outcome.outcomeRef,
      status: outcome.status,
      findings: Object.freeze([...outcome.findings]) as readonly string[],
    });
  });
  if (new Set(outcomeResults.map((outcome) => outcome.outcomeRef)).size !== outcomeResults.length) {
    return malformed();
  }
  const floors = record(receipt.hardFloors, FLOOR_KEYS);
  if (Object.values(floors).some((value) => value !== 'pass' && value !== 'fail')) return malformed();
  const transcript = strings(receipt.transcript, TRANSCRIPT, false);
  for (const floor of ['access', 'safety'] as const) {
    if (floors[floor] === 'pass' && transcript.some((entry) => entry.startsWith(`${floor}-finding:`))) {
      return malformed();
    }
  }
  const entrySurface = receipt.entrySurface === undefined
    ? undefined
    : (() => {
      const entry = record(receipt.entrySurface, ENTRY_SURFACE_KEYS);
      if (typeof entry.prerequisiteTaskId !== 'string' || entry.prerequisiteTaskId === ''
        || typeof entry.dependentTaskId !== 'string' || entry.dependentTaskId === ''
        || (entry.status !== 'pass' && entry.status !== 'fail')) return malformed();
      return Object.freeze({
        benchmarkProjectionSha256: digest(entry.benchmarkProjectionSha256),
        prerequisiteTaskId: entry.prerequisiteTaskId,
        dependentTaskId: entry.dependentTaskId,
        status: entry.status,
      });
    })();
  const captures = receipt.captures.map((candidate) => {
    const scoped = typeof candidate === 'object' && candidate !== null
      && Object.hasOwn(candidate, 'outcomeRef');
    const keys = new Set(scoped ? OUTCOME_CAPTURE_KEYS : CAPTURE_KEYS);
    if (typeof candidate === 'object' && candidate !== null && Object.hasOwn(candidate, 'testedUrl')) keys.add('testedUrl');
    const capture = record(candidate, keys);
    if (typeof capture.path !== 'string' || capture.path === '' || capture.path.startsWith('/')
      || capture.path.includes('\\') || capture.path.split('/').some((part) => part === '' || part === '.' || part === '..')
      || !Number.isInteger(capture.width) || !Number.isInteger(capture.height)
      || (capture.width as number) <= 0 || (capture.height as number) <= 0) return malformed();
    return Object.freeze({
      path: capture.path,
      sha256: digest(capture.sha256),
      width: capture.width as number,
      height: capture.height as number,
      ...(capture.testedUrl === undefined ? {} : { testedUrl: (() => {
        if (typeof capture.testedUrl !== 'string') return malformed();
        let url: URL;
        try { url = new URL(capture.testedUrl); } catch { return malformed(); }
        if (url.origin !== 'http://127.0.0.1' || url.username || url.password || url.href !== capture.testedUrl) return malformed();
        return url.href;
      })() }),
      ...(capture.outcomeRef === undefined
        ? {}
        : {
          outcomeRef: typeof capture.outcomeRef === 'string' && capture.outcomeRef !== ''
            ? capture.outcomeRef
            : malformed(),
        }),
    });
  });
  return Object.freeze({
    schema: TRUSTED_BROWSER_RECEIPT_SCHEMA,
    runId: receipt.runId,
    routeSha256: digest(receipt.routeSha256),
    sourceContractSha256: digest(receipt.sourceContractSha256),
    activationBuildSha256: digest(receipt.activationBuildSha256),
    productionRevisionSha256: digest(receipt.productionRevisionSha256),
    productionPath: (() => {
      if (typeof receipt.productionPath !== 'string' || receipt.productionPath === ''
        || receipt.productionPath.startsWith('/') || receipt.productionPath.includes('\\')
        || receipt.productionPath.split('/').some((part) => part === '' || part === '.' || part === '..')) return malformed();
      return receipt.productionPath;
    })(),
    testedUrl: (() => {
      if (typeof receipt.testedUrl !== 'string'
        || !/^http:\/\/127\.0\.0\.1(?::\d+)?\/\S*$/.test(receipt.testedUrl)) return malformed();
      return receipt.testedUrl;
    })(),
    decisionGraphSha256: digest(receipt.decisionGraphSha256),
    outcomeResults: Object.freeze(outcomeResults),
    confirmedClaimRefs: strings(receipt.confirmedClaimRefs, undefined, true, true),
    decisionRefs: strings(receipt.decisionRefs),
    hardFloors: Object.freeze({
      behavior: floors.behavior as 'pass' | 'fail',
      access: floors.access as 'pass' | 'fail',
      safety: floors.safety as 'pass' | 'fail',
    }),
    captures: Object.freeze(captures),
    transcript,
    ...(entrySurface === undefined ? {} : { entrySurface }),
  });
}

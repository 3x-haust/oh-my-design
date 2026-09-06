import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type {
  Frame,
  RealityCategory,
  RealityFact,
  RealityLedger,
  RealityStatus,
} from '../types.ts';
import {
  REALITY_CATEGORY_VALUES,
  REALITY_STATUS_VALUES,
} from '../types.ts';
import { parseEntrySurfaceContract } from './entry-surface-contract.ts';

export type { RealityCategory, RealityFact, RealityLedger, RealityStatus } from '../types.ts';

const framePath = (cwd: string): string => join(cwd, '.omd', 'frame.md');

const isEnoent = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';

const REALITY_CATEGORIES = new Set<RealityCategory>([
  ...REALITY_CATEGORY_VALUES,
]);
const REALITY_STATUSES = new Set<RealityStatus>(REALITY_STATUS_VALUES);
const plainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const boundedText = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 240) {
    throw new Error(`${label} must be a non-empty string of at most 240 characters`);
  }
  return value.trim();
};

export function parseRealityLedger(value: unknown): RealityLedger {
  if (!plainRecord(value)) throw new Error('reality ledger must be an object');
  if (Object.keys(value).sort().join(',') !== 'facts,mode,schema') {
    throw new Error('reality ledger keys are invalid');
  }
  if (value.schema !== 'reality-ledger-v1') throw new Error('reality ledger schema is invalid');
  if (value.mode !== 'greenfield' && value.mode !== 'existing') throw new Error('reality ledger mode is invalid');
  if (!Array.isArray(value.facts) || value.facts.length === 0 || value.facts.length > 12) {
    throw new Error('reality ledger facts must contain 1..12 entries');
  }
  const facts = value.facts.map((fact, index): RealityFact => {
    if (!plainRecord(fact)) throw new Error(`reality facts[${index}] must be an object`);
    const keys = Object.keys(fact).sort().join(',');
    if (keys !== 'category,statement,status' && keys !== 'category,source,statement,status') {
      throw new Error(`reality facts[${index}] keys are invalid`);
    }
    if (!REALITY_CATEGORIES.has(fact.category as RealityCategory)) {
      throw new Error(`reality facts[${index}].category is invalid`);
    }
    if (!REALITY_STATUSES.has(fact.status as RealityStatus)) {
      throw new Error(`reality facts[${index}].status is invalid`);
    }
    const source = fact.source === undefined
      ? undefined
      : boundedText(fact.source, `reality facts[${index}].source`);
    return {
      category: fact.category as RealityCategory,
      status: fact.status as RealityStatus,
      statement: boundedText(fact.statement, `reality facts[${index}].statement`),
      ...(source === undefined ? {} : { source }),
    };
  });
  return { schema: 'reality-ledger-v1', mode: value.mode, facts };
}

/**
 * The frame is a record, not a gate. Nothing blocks on it.
 *
 * An earlier version made a human sign the reframing before any file could be written.
 * That solved the wrong problem: a wrong reframing is caught by building something,
 * rendering it, and looking — not by a signature. Worse, it made the loop impossible,
 * since nothing could be built while approval was pending, so there was nothing to look
 * at, so nothing could reveal the reframing was wrong.
 */
export function readFrame(cwd: string): Frame | null {
  let text: string;
  try {
    text = readFileSync(framePath(cwd), 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }

  if (!text.startsWith('---\n')) return { body: text };

  const closeIndex = text.indexOf('\n---', 3);
  if (closeIndex === -1) return { body: text };

  const frontmatter = (parse(text.slice(4, closeIndex)) ?? {}) as Partial<Frame>;
  if (frontmatter.reality !== undefined) {
    frontmatter.reality = parseRealityLedger(frontmatter.reality);
  }
  if (frontmatter.entrySurface !== undefined) {
    frontmatter.entrySurface = parseEntrySurfaceContract(frontmatter.entrySurface);
  }
  const rest = text.slice(closeIndex + 4);
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;

  return { ...frontmatter, body };
}

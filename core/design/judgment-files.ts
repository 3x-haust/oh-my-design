import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import {
  designJudgmentRecordSha256,
  parseDesignJudgmentRecord,
  type DesignJudgmentRecord,
} from './judgment.ts';
export const DESIGN_JUDGMENT_PATH = '.omd/design-judgment.json' as const;
export const DESIGN_JUDGMENT_MARKDOWN_PATH = '.omd/design-judgment.md' as const;

export const DESIGN_JUDGMENT_POINTER_SCHEMA = 'design-judgment-pointer-v1' as const;
export const DESIGN_JUDGMENT_RECORD_DIRECTORY = '.omd/design-judgments';

export type DesignJudgmentPointer = Readonly<{
  schema: typeof DESIGN_JUDGMENT_POINTER_SCHEMA;
  record: string;
  sha256: string;
  referenceBoardSha256: string;
}>;

export function publishDesignJudgment(
  root: string,
  value: unknown,
  writer: ProjectWriteAdapter,
): DesignJudgmentPointer {
  const record = parseDesignJudgmentRecord(value);
  const sha256 = designJudgmentRecordSha256(record);
  const recordPath = `${DESIGN_JUDGMENT_RECORD_DIRECTORY}/sha256-${sha256}.json`;
  writer.writeContentAddressed(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const pointer = Object.freeze({
    schema: DESIGN_JUDGMENT_POINTER_SCHEMA,
    record: recordPath.replace(/^\.omd\//, ''),
    sha256,
    referenceBoardSha256: record.referenceBoardSha256,
  });
  writer.write(DESIGN_JUDGMENT_PATH, `${JSON.stringify(pointer, null, 2)}\n`);
  const markdown = [
    '# Design judgment',
    '',
    `Reference board: ${record.referenceBoardSha256}`,
    '',
    '## Design hypothesis',
    `- Feels like: ${record.hypothesis.feelsLike}`,
    `- Dominant object: ${record.hypothesis.dominantObject}`,
    `- Subordinate: ${record.hypothesis.subordinate.join(', ')}`,
    `- Density: ${record.hypothesis.densityIntent}`,
    `- Trust: ${record.hypothesis.trustSource}`,
    `- Two-second read: ${record.hypothesis.twoSecondRead}`,
    '',
    '## Reference judgments',
    ...record.judgments.flatMap((judgment) => [
      `### ${judgment.id} (${judgment.relevance}, ${judgment.scope})`,
      `- Observation: ${judgment.observation}`,
      `- Why it works there: ${judgment.whyItWorksThere}`,
      `- Adopt: ${judgment.adopt.join('; ') || 'nothing'}`,
      `- Reject: ${judgment.reject.join('; ') || 'nothing'}`,
      `- Interpretation: ${judgment.interpretation}`,
      '',
    ]),
  ].join('\n');
  writer.write(DESIGN_JUDGMENT_MARKDOWN_PATH, `${markdown}\n`);
  return pointer;
}

export function readDesignJudgment(root: string): DesignJudgmentRecord | null {
  const pointerPath = join(root, DESIGN_JUDGMENT_PATH);
  if (!existsSync(pointerPath)) return null;
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as DesignJudgmentPointer;
  if (pointer.schema !== DESIGN_JUDGMENT_POINTER_SCHEMA || !/^[a-f0-9]{64}$/.test(pointer.sha256)) {
    throw new Error('design judgment pointer is malformed');
  }
  const recordPath = join(root, '.omd', pointer.record);
  const bytes = readFileSync(recordPath);
  const record = parseDesignJudgmentRecord(JSON.parse(bytes.toString('utf8')));
  const digest = createHash('sha256').update(JSON.stringify(record)).digest('hex');
  if (digest !== pointer.sha256 || record.referenceBoardSha256 !== pointer.referenceBoardSha256) {
    throw new Error('design judgment pointer is stale');
  }
  return record;
}

export function requireDesignJudgmentForReferences(
  root: string,
  referenceBoardSha256: string,
): DesignJudgmentRecord {
  const judgment = readDesignJudgment(root);
  if (judgment === null) {
    throw new Error('DESIGN_JUDGMENT_REQUIRED: selected references must be interpreted before art direction or composition');
  }
  if (judgment.referenceBoardSha256 !== referenceBoardSha256) {
    throw new Error('DESIGN_JUDGMENT_STALE: the judgment was made from another reference board');
  }
  return judgment;
}

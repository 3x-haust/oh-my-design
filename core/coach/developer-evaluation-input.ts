import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import {
  DeveloperEvaluationError,
  parseDeveloperEvaluationScope,
  type ComparedImage,
  type DeveloperEvaluationRecordInput,
  type EvaluationRole,
  type InterviewResponse,
  type JsonValue,
} from './developer-evaluation-contract.ts';

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const fail = (message: string): never => { throw new DeveloperEvaluationError(message); };
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => deepFreeze(Reflect.get(value, key)));
    Object.freeze(value);
  }
  return value;
};
const own = (value: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail(`${label} must be a plain object`);
  }
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('\0') !== [...keys].sort().join('\0')) {
    return fail(`${label} has unknown or missing fields`);
  }
  return item;
};
const text = (value: unknown, label: string, max = 2048): string => {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > max) {
    return fail(`${label} must be non-empty trimmed text`);
  }
  return value;
};
const possiblyEmptyText = (value: unknown, label: string, max = 4096): string => {
  if (typeof value !== 'string' || value.trim() !== value || value.length > max) {
    return fail(`${label} must be trimmed text`);
  }
  return value;
};
const id = (value: unknown, label: string): string => {
  const result = text(value, label, 128);
  if (!ID.test(result)) return fail(`${label} is invalid`);
  return result;
};
const timestamp = (value: unknown, label: string): string => {
  const result = text(value, label, 64);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    return fail(`${label} must be a canonical ISO timestamp`);
  }
  return result;
};
const stringArray = (value: unknown, label: string, minimum = 0, maximum = 32): readonly string[] => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    return fail(`${label} must contain ${minimum}-${maximum} entries`);
  }
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`));
  if (new Set(result).size !== result.length) return fail(`${label} must not contain duplicates`);
  return Object.freeze(result);
};

function stableImage(image: unknown, label: string): ComparedImage {
  const item = own(image, ['path', 'sha256'], label);
  const path = text(item.path, `${label}.path`, 4096);
  const expected = text(item.sha256, `${label}.sha256`, 64);
  if (!isAbsolute(path) || resolve(path) !== path || !HASH.test(expected)) return fail(`${label} needs an absolute path and SHA-256`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    const entry = lstatSync(path);
    if (!before.isFile() || entry.isSymbolicLink() || !entry.isFile()
      || before.dev !== entry.dev || before.ino !== entry.ino || before.nlink !== 1 || entry.nlink !== 1
      || join(realpathSync(dirname(path)), path.slice(dirname(path).length + 1)) !== realpathSync(path)) {
      return fail(`${label} must be a stable regular file`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength === 0 || sha256(bytes) !== expected) return fail(`${label} bytes do not match SHA-256`);
    const magic = bytes.subarray(0, 12);
    const png = magic.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff;
    const gif = magic.subarray(0, 6).toString('ascii') === 'GIF87a' || magic.subarray(0, 6).toString('ascii') === 'GIF89a';
    const webp = magic.subarray(0, 4).toString('ascii') === 'RIFF' && magic.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!png && !jpeg && !gif && !webp) return fail(`${label} is not a recognized image`);
    return Object.freeze({ path, sha256: expected });
  } catch (error) {
    if (error instanceof DeveloperEvaluationError) throw error;
    return fail(`${label} could not be read safely`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
function imageReference(image: unknown, label: string): ComparedImage {
  const item = own(image, ['path', 'sha256'], label);
  const path = text(item.path, `${label}.path`, 4096);
  const digest = text(item.sha256, `${label}.sha256`, 64);
  if (!isAbsolute(path) || resolve(path) !== path || !HASH.test(digest)) return fail(`${label} needs an absolute path and SHA-256`);
  return Object.freeze({ path, sha256: digest });
}
function interview(value: unknown, label: string, allowEmpty = false): InterviewResponse {
  const item = own(value, ['questions', 'answers'], label);
  if (!Array.isArray(item.questions) || !Array.isArray(item.answers)) {
    return fail(`${label} needs bounded questions and answers`);
  }
  if (allowEmpty && item.questions.length === 0 && item.answers.length === 0) {
    return Object.freeze({ questions: Object.freeze([]), answers: Object.freeze([]) });
  }
  if (item.questions.length === 0 || item.questions.length > 32) {
    return fail(`${label} needs bounded questions and answers`);
  }
  const questions = item.questions.map((entry, index) => {
    const question = own(entry, ['id', 'prompt', 'options'], `${label}.questions[${index}]`);
    const questionId = id(question.id, `${label}.questions[${index}].id`);
    if (!Array.isArray(question.options) || question.options.length > 16) return fail(`${label}.questions[${index}].options is invalid`);
    const options = question.options.map((optionValue, optionIndex) => {
      const option = own(optionValue, ['id', 'label'], `${label}.questions[${index}].options[${optionIndex}]`);
      return Object.freeze({
        id: id(option.id, `${label}.questions[${index}].options[${optionIndex}].id`),
        label: text(option.label, `${label}.questions[${index}].options[${optionIndex}].label`),
      });
    });
    if (new Set(options.map((option) => option.id)).size !== options.length) return fail(`${label} question options must be unique`);
    return Object.freeze({ id: questionId, prompt: text(question.prompt, `${label}.questions[${index}].prompt`), options: Object.freeze(options) });
  });
  if (new Set(questions.map((question) => question.id)).size !== questions.length
    || item.answers.length !== questions.length) return fail(`${label} needs exactly one answer for every question`);
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const answers = item.answers.map((entry, index) => {
    const answer = own(entry, ['questionId', 'optionIds', 'text'], `${label}.answers[${index}]`);
    const questionId = id(answer.questionId, `${label}.answers[${index}].questionId`);
    const question = questionMap.get(questionId);
    if (question === undefined) return fail(`${label} answer references an unknown question`);
    const optionIds = stringArray(answer.optionIds, `${label}.answers[${index}].optionIds`, 0, 16);
    if (optionIds.some((optionId) => !question.options.some((option) => option.id === optionId))) {
      return fail(`${label} answer references an unknown option`);
    }
    if (answer.text !== null && (typeof answer.text !== 'string' || answer.text.length === 0 || answer.text.length > 4096)) {
      return fail(`${label}.answers[${index}].text must be bounded verbatim text`);
    }
    const answerText = answer.text;
    if (optionIds.length === 0 && answerText === null) return fail(`${label} cannot treat an absent answer as approval`);
    return Object.freeze({ questionId, optionIds, text: answerText });
  });
  if (new Set(answers.map((answer) => answer.questionId)).size !== questions.length) {
    return fail(`${label} needs one distinct answer for every question`);
  }
  return Object.freeze({ questions: Object.freeze(questions), answers: Object.freeze(answers) });
}
function json(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fail(`${label} numbers must be finite`);
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map((entry, index) => json(entry, `${label}[${index}]`)));
  if (typeof value !== 'object' || value === null
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail(`${label} must be JSON data`);
  }
  const output: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) output[key] = json(entry, `${label}.${key}`);
  return Object.freeze(output);
}
function role(value: unknown, label: string): EvaluationRole {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(`${label} is invalid`);
  if (Reflect.get(value, 'kind') === 'development') {
    own(value, ['kind'], label);
    return Object.freeze({ kind: 'development' });
  }
  const item = own(value, ['kind', 'candidateRecordId', 'candidateImage', 'caseDecision'], label);
  if (item.kind !== 'held-out' || (item.candidateImage !== 'a' && item.candidateImage !== 'b')
    || !['approve', 'reject', 'uncertain'].includes(item.caseDecision as string)) return fail(`${label} is invalid`);
  return Object.freeze({
    kind: 'held-out', candidateRecordId: id(item.candidateRecordId, `${label}.candidateRecordId`),
    candidateImage: item.candidateImage, caseDecision: item.caseDecision as 'approve' | 'reject' | 'uncertain',
  });
}

function parseInput(value: unknown, verifyImages: boolean): DeveloperEvaluationRecordInput {
  const item = own(value, [
    'recordId', 'requestId', 'taskId', 'capturedAt', 'scope', 'role', 'images', 'humanResponse',
    'relations', 'changes', 'modelInterpretation', 'experiment', 'reuse',
  ], 'record');
  const scope = parseDeveloperEvaluationScope(item.scope);
  const images = own(item.images, ['a', 'b'], 'record.images');
  const human = own(item.humanResponse, ['interview', 'comparisonChoice', 'satisfaction', 'postChange'], 'record.humanResponse');
  if (!['a', 'b', 'tie', 'neither', 'uncertain'].includes(human.comparisonChoice as string)
    || !['satisfied', 'mixed', 'unsatisfied', 'uncertain'].includes(human.satisfaction as string)) {
    return fail('record human comparison choice or satisfaction is invalid');
  }
  const relations = own(item.relations, ['references', 'design'], 'record.relations');
  const changes = own(item.changes, ['attempted', 'preserved'], 'record.changes');
  const interpretation = own(item.modelInterpretation, ['summary', 'advisory'], 'record.modelInterpretation');
  const experiment = own(item.experiment, ['model', 'settings', 'budget', 'criteriaVersion'], 'record.experiment');
  const budget = own(experiment.budget, ['unit', 'limit'], 'record.experiment.budget');
  if (typeof budget.limit !== 'number' || !Number.isFinite(budget.limit) || budget.limit < 0) {
    return fail('record.experiment.budget.limit is invalid');
  }
  const reuse = own(item.reuse, ['consent', 'scope'], 'record.reuse');
  if (reuse.consent !== 'allow-private-advisory-reuse' && reuse.consent !== 'deny') return fail('record.reuse.consent is invalid');
  const reuseScope = parseDeveloperEvaluationScope(reuse.scope, 'record.reuse.scope');
  if (canonicalJson(scope) !== canonicalJson(reuseScope)) return fail('record reuse scope must exactly match its structural request scope');
  return deepFreeze({
    recordId: id(item.recordId, 'record.recordId'), requestId: id(item.requestId, 'record.requestId'),
    taskId: id(item.taskId, 'record.taskId'), capturedAt: timestamp(item.capturedAt, 'record.capturedAt'),
    scope, role: role(item.role, 'record.role'),
    images: {
      a: verifyImages ? stableImage(images.a, 'record.images.a') : imageReference(images.a, 'record.images.a'),
      b: verifyImages ? stableImage(images.b, 'record.images.b') : imageReference(images.b, 'record.images.b'),
    },
    humanResponse: {
      interview: interview(human.interview, 'record.humanResponse.interview'),
      comparisonChoice: human.comparisonChoice as DeveloperEvaluationRecordInput['humanResponse']['comparisonChoice'],
      satisfaction: human.satisfaction as DeveloperEvaluationRecordInput['humanResponse']['satisfaction'],
      postChange: interview(human.postChange, 'record.humanResponse.postChange', true),
    },
    relations: {
      references: stringArray(relations.references, 'record.relations.references'),
      design: stringArray(relations.design, 'record.relations.design'),
    },
    changes: {
      attempted: stringArray(changes.attempted, 'record.changes.attempted'),
      preserved: stringArray(changes.preserved, 'record.changes.preserved'),
    },
    modelInterpretation: {
      summary: possiblyEmptyText(interpretation.summary, 'record.modelInterpretation.summary'),
      advisory: stringArray(interpretation.advisory, 'record.modelInterpretation.advisory', 0, 16),
    },
    experiment: {
      model: text(experiment.model, 'record.experiment.model'), settings: json(experiment.settings, 'record.experiment.settings'),
      budget: { unit: id(budget.unit, 'record.experiment.budget.unit'), limit: budget.limit },
      criteriaVersion: id(experiment.criteriaVersion, 'record.experiment.criteriaVersion'),
    },
    reuse: { consent: reuse.consent, scope: reuseScope },
  });
}
export function parseDeveloperEvaluationInput(value: unknown): DeveloperEvaluationRecordInput {
  return parseInput(value, true);
}
export function parseStoredDeveloperEvaluationInput(value: unknown): DeveloperEvaluationRecordInput {
  return parseInput(value, false);
}
export const parseEvaluationInput = parseDeveloperEvaluationInput;

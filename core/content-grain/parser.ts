import { posix } from 'node:path';
import type {
  ContentGrain,
  GrainFixture,
  GrainMetric,
  GrainSource,
  GrainTrait,
} from './contract.ts';
import {
  canonicalSha256,
  closedObject,
  digest,
  freeze,
  identifier,
  integer,
  invalid,
  list,
  literal,
  text,
  unique,
} from './strict.ts';

const SOURCE_KEYS = ['id', 'authority', 'path', 'sha256'] as const;
const FIXTURE_KEYS = ['id', 'sourceId', 'locator', 'role'] as const;
const TRAIT_KEYS = [
  'id',
  'sourceIds',
  'fixtureIds',
  'metric',
  'semanticRole',
  'antiTemplateConsequence',
  'responsiveConsequence',
  'falsifier',
] as const;

const projectPath = (value: unknown, label: string): string => {
  const path = text(value, label);
  if (
    path.startsWith('/')
    || path.includes('\\')
    || path === '.'
    || posix.normalize(path) !== path
    || path.split('/').includes('..')
  ) {
    return invalid(`${label} must be a normalized project-relative path`);
  }
  return path;
};

const parseSources = (value: unknown): readonly GrainSource[] => {
  const sources = list(value, 'sources').map((entry, index) => {
    const source = closedObject(entry, `sources[${index}]`, SOURCE_KEYS);
    return {
      id: identifier(source.id, `sources[${index}].id`),
      authority: literal(source.authority, `sources[${index}].authority`, [
        'current-user',
        'project-first-party',
      ]),
      path: projectPath(source.path, `sources[${index}].path`),
      sha256: digest(source.sha256, `sources[${index}].sha256`),
    } satisfies GrainSource;
  });
  if (sources.length === 0) invalid('sources must contain at least one source');
  unique(sources.map(({ id }) => id), 'source ids');
  unique(sources.map(({ path }) => path), 'source paths');
  return sources;
};

const parseFixtures = (value: unknown, sources: ReadonlySet<string>): readonly GrainFixture[] => {
  const fixtures = list(value, 'fixtures').map((entry, index) => {
    const fixture = closedObject(entry, `fixtures[${index}]`, FIXTURE_KEYS);
    const sourceId = identifier(fixture.sourceId, `fixtures[${index}].sourceId`);
    if (!sources.has(sourceId)) invalid(`fixtures[${index}].sourceId does not resolve`);
    return {
      id: identifier(fixture.id, `fixtures[${index}].id`),
      sourceId,
      locator: text(fixture.locator, `fixtures[${index}].locator`),
      role: literal(fixture.role, `fixtures[${index}].role`, [
        'typical',
        'minimum',
        'maximum',
        'protected-outlier',
      ]),
    } satisfies GrainFixture;
  });
  if (fixtures.length < 2 || fixtures.length > 4) {
    invalid('fixtures must contain between two and four entries');
  }
  unique(fixtures.map(({ id }) => id), 'fixture ids');
  if (fixtures.filter(({ role }) => role === 'typical').length !== 1) {
    invalid('fixtures must contain exactly one typical fixture');
  }
  if (!fixtures.some(({ role }) => role !== 'typical')) {
    invalid('fixtures must contain at least one edge fixture');
  }
  if (fixtures.filter(({ role }) => role === 'protected-outlier').length > 1) {
    invalid('fixtures may contain at most one protected outlier');
  }
  return fixtures;
};

const parseMetric = (value: unknown, label: string): GrainMetric => {
  const probe = closedObject(value, label, [
    'kind',
    'unit',
    'minimum',
    'typical',
    'maximum',
    'fixtureId',
  ]);
  const kind = literal(probe.kind, `${label}.kind`, ['range', 'semantic-priority']);
  if (kind === 'semantic-priority') {
    const metric = closedObject(value, label, ['kind', 'fixtureId']);
    return {
      kind,
      fixtureId: identifier(metric.fixtureId, `${label}.fixtureId`),
    };
  }
  const metric = closedObject(value, label, ['kind', 'unit', 'minimum', 'typical', 'maximum']);
  const minimum = integer(metric.minimum, `${label}.minimum`);
  const typical = integer(metric.typical, `${label}.typical`);
  const maximum = integer(metric.maximum, `${label}.maximum`);
  if (!(minimum <= typical && typical <= maximum && minimum < maximum)) {
    invalid(`${label} range must satisfy minimum <= typical <= maximum and minimum < maximum`);
  }
  return {
    kind,
    unit: literal(metric.unit, `${label}.unit`, ['graphemes', 'items', 'ratio-milli']),
    minimum,
    typical,
    maximum,
  };
};

const parseTraits = (
  value: unknown,
  sources: ReadonlySet<string>,
  fixtures: ReadonlySet<string>,
): readonly GrainTrait[] => {
  const traits = list(value, 'traits').map((entry, index) => {
    const trait = closedObject(entry, `traits[${index}]`, TRAIT_KEYS);
    const sourceIds = unique(
      list(trait.sourceIds, `traits[${index}].sourceIds`).map((id, sourceIndex) =>
        identifier(id, `traits[${index}].sourceIds[${sourceIndex}]`)),
      `traits[${index}].sourceIds`,
    );
    const fixtureIds = unique(
      list(trait.fixtureIds, `traits[${index}].fixtureIds`).map((id, fixtureIndex) =>
        identifier(id, `traits[${index}].fixtureIds[${fixtureIndex}]`)),
      `traits[${index}].fixtureIds`,
    );
    if (sourceIds.length === 0 || fixtureIds.length === 0) {
      invalid(`traits[${index}] references must be non-empty`);
    }
    for (const sourceId of sourceIds) {
      if (!sources.has(sourceId)) invalid(`traits[${index}] source ${sourceId} does not resolve`);
    }
    for (const fixtureId of fixtureIds) {
      if (!fixtures.has(fixtureId)) invalid(`traits[${index}] fixture ${fixtureId} does not resolve`);
    }
    const metric = parseMetric(trait.metric, `traits[${index}].metric`);
    if (metric.kind === 'semantic-priority' && !fixtureIds.includes(metric.fixtureId)) {
      invalid(`traits[${index}] semantic-priority fixture must be referenced`);
    }
    return {
      id: identifier(trait.id, `traits[${index}].id`),
      sourceIds,
      fixtureIds,
      metric,
      semanticRole: text(trait.semanticRole, `traits[${index}].semanticRole`),
      antiTemplateConsequence: text(
        trait.antiTemplateConsequence,
        `traits[${index}].antiTemplateConsequence`,
      ),
      responsiveConsequence: text(
        trait.responsiveConsequence,
        `traits[${index}].responsiveConsequence`,
      ),
      falsifier: text(trait.falsifier, `traits[${index}].falsifier`),
    } satisfies GrainTrait;
  });
  if (traits.length < 1 || traits.length > 3) {
    invalid('traits must contain between one and three entries');
  }
  unique(traits.map(({ id }) => id), 'trait ids');
  return traits;
};

export const parseContentGrain = (value: unknown): ContentGrain => {
  const grain = closedObject(value, 'content grain', [
    'schema',
    'status',
    'sources',
    'traits',
    'fixtures',
    'reason',
  ]);
  if (grain.schema !== 'content-grain-v1') invalid('schema must be content-grain-v1');
  const status = literal(grain.status, 'status', ['active', 'no-stable-grain']);
  const sources = parseSources(grain.sources);
  if (status === 'no-stable-grain') {
    const closed = closedObject(value, 'content grain', ['schema', 'status', 'sources', 'reason']);
    return freeze({
      schema: 'content-grain-v1',
      status,
      sources,
      reason: text(closed.reason, 'reason'),
    });
  }
  const closed = closedObject(value, 'content grain', [
    'schema',
    'status',
    'sources',
    'traits',
    'fixtures',
  ]);
  const fixtures = parseFixtures(closed.fixtures, new Set(sources.map(({ id }) => id)));
  const traits = parseTraits(
    closed.traits,
    new Set(sources.map(({ id }) => id)),
    new Set(fixtures.map(({ id }) => id)),
  );
  return freeze({ schema: 'content-grain-v1', status, sources, traits, fixtures });
};

export const contentGrainSha256 = (grain: ContentGrain): string => canonicalSha256(grain);

export const contentGrainDecisionToken = (grainSha256: string, traitId: string): string =>
  `content-grain:${digest(grainSha256, 'grainSha256')}:${identifier(traitId, 'traitId')}`;

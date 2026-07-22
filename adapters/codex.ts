import { createHash } from 'node:crypto';
import { substituter } from './tokens.ts';
import { browserRsMcpConfig } from './browser-mcp.ts';
import type { BuildIdentity } from './build.ts';
import { ACTIVATION_CONTEXT_SCHEMA_VERSION, validateActivationContext, type ActivationContext } from '../core/runtime/activation.ts';
import type { AbstractAgent, Emitted } from '../core/types.ts';
import {
  type ReviewerLaunchBundle,
} from './reviewer-mcp.ts';

const substitute = substituter('codex');
export const CODEX_LOADED_SKILL_RECEIPT_SCHEMA_VERSION = 'codex-loaded-skill-receipt-v1' as const;

export type CodexLoadedSkillReceipt = {
  readonly schemaVersion: typeof CODEX_LOADED_SKILL_RECEIPT_SCHEMA_VERSION;
  readonly loadedSkillSha256: string;
};
const observedSkillReceipts = new WeakSet<CodexLoadedSkillReceipt>();


export type CodexV2PublicationPreflightInput = {
  readonly buildIdentity: BuildIdentity;
  readonly loadedSkillReceipt: CodexLoadedSkillReceipt;
  readonly briefSha256: string;
  readonly reviewerLaunchBundle: ReviewerLaunchBundle;
};

export function observeCodexLoadedSkill(buildIdentity: BuildIdentity, loadedSkillBytes: string): CodexLoadedSkillReceipt {
  const receipt = Object.freeze({
    schemaVersion: CODEX_LOADED_SKILL_RECEIPT_SCHEMA_VERSION,
    loadedSkillSha256: createHash('sha256').update(loadedSkillBytes).digest('hex'),
  });
  if (receipt.loadedSkillSha256 !== buildIdentity.sourceSkillSha256) {
    throw new Error('Codex observed loaded skill does not match the installed build');
  }
  observedSkillReceipts.add(receipt);
  return receipt;
}

export function preflightCodexV2Publication(input: CodexV2PublicationPreflightInput): ActivationContext {
  const { buildIdentity, loadedSkillReceipt, briefSha256, reviewerLaunchBundle } = input;
  if (
    loadedSkillReceipt.schemaVersion !== CODEX_LOADED_SKILL_RECEIPT_SCHEMA_VERSION
    || !observedSkillReceipts.has(loadedSkillReceipt)
  ) {
    throw new Error('Codex v2 preflight requires a host-observed loaded-skill/build receipt');
  }
  if (loadedSkillReceipt.loadedSkillSha256 !== buildIdentity.sourceSkillSha256) {
    throw new Error('Codex loaded skill bytes do not match the current build source skill hash');
  }
  if (reviewerLaunchBundle === undefined) throw new Error('Codex reviewer preflight requires an evidence launch bundle');
  const bundle = reviewerLaunchBundle.adapter.requireLaunchBundle(reviewerLaunchBundle, 'codex');
  if (bundle.loadedSkillReceipt.loadedSkillReceipt !== loadedSkillReceipt) {
    throw new Error('Codex v2 preflight requires the bundle-attached observed loaded-skill receipt');
  }
  if (
    bundle.reviewerLaunchReceipt.buildSha256 !== buildIdentity.buildSha256
    || bundle.reviewerLaunchReceipt.briefSha256 !== briefSha256
    || bundle.loadedSkillReceipt.loadedSkillSha256 !== loadedSkillReceipt.loadedSkillSha256
  ) {
    throw new Error('Codex reviewer launch bundle does not match the current build, loaded skill, and brief');
  }
  bundle.adapter.requireConfiguration(bundle.configuration, bundle.reviewerLaunchReceipt, 'codex');
  return validateActivationContext({
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: buildIdentity.buildSha256,
    loadedSkillSha256: loadedSkillReceipt.loadedSkillSha256,
    briefSha256,
    hostCapability: { host: 'codex' },
  });
}

const tomlBasic = (s: string): string =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

function tomlMultiline(s: string): string {
  const body = s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  return `"""\n${body.endsWith('\n') ? body : `${body}\n`}"""`;
}


/**
 * Codex agent TOML has no tool-restriction key — only name, description, model,
 * model_reasoning_effort, developer_instructions, nickname_candidates, service_tier.
 * Denial is therefore prose here, not policy, exactly as Codex's own read-only agents do
 * it. Claude Code enforces the same list declaratively via disallowedTools.
 */
function denialProse(deny: string[] | undefined): string {
  if (!deny?.length) return '';
  return `\n\nHARD CONSTRAINT: you have no write access. You must never call ${deny.join(', ')}, `
    + 'and you must never ask another agent to write on your behalf. If a change is needed, '
    + 'describe it and stop.\n';
}

const emitAgentFile = (agent: AbstractAgent): string => [
  `name = ${tomlBasic(agent.name)}`,
  `description = ${tomlBasic(agent.description)}`,
  `model_reasoning_effort = ${tomlBasic(agent.reasoning)}`,
  `developer_instructions = ${tomlMultiline(`${substitute(agent.instructions)}${denialProse(agent.deny)}`)}`,
  '',
].join('\n');
export type CodexReviewerIsolation = {
  /** Host-observed launch/session receipt; copied receipts are rejected by the adapter. */
  readonly reviewerLaunchBundle: ReviewerLaunchBundle;
};

function codexMcpConfig(reviewer: CodexReviewerIsolation | undefined): unknown {
  return reviewer === undefined
    ? browserRsMcpConfig()
    : reviewer.reviewerLaunchBundle.adapter.requireLaunchBundle(reviewer.reviewerLaunchBundle, 'codex').configuration;
}


export function emitCodex({
  agents = [],
  version = '0.0.0',
  buildIdentity,
  reviewer,
}: {
  agents?: AbstractAgent[];
  version?: string;
  buildIdentity?: BuildIdentity;
  reviewer?: CodexReviewerIsolation;
} = {}): Emitted {
  const files: Record<string, unknown> = {};

  for (const agent of agents) files[`agents/${agent.name}.toml`] = emitAgentFile(agent);

  files['.mcp.json'] = codexMcpConfig(reviewer);

  files['.codex-plugin/plugin.json'] = {
    name: 'oh-my-design',
    version,
    description: 'Design cognition loop — frame, diverge, see, reframe',
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: 'Oh My Design',
      shortDescription: 'Design cognition loop — frame, diverge, see, reframe',
      capabilities: ['Hooks', 'Skills', 'Subagents', 'Design Lint'],
    },
    ...(buildIdentity === undefined ? {} : { buildIdentity }),
  };

  return { files };
}

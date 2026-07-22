import { createHash } from 'node:crypto';
import { substituter } from './tokens.ts';
import { browserRsMcpConfig } from './browser-mcp.ts';
import type { BuildIdentity } from './build.ts';
import { ACTIVATION_CONTEXT_SCHEMA_VERSION, validateActivationContext, type ActivationContext } from '../core/runtime/activation.ts';
import type { AbstractAgent, Emitted } from '../core/types.ts';
import {
  type ReviewerLaunchBundle,
} from './reviewer-mcp.ts';

const substitute = substituter('claude');
export const CLAUDE_LOADED_SKILL_RECEIPT_SCHEMA_VERSION = 'claude-loaded-skill-receipt-v1' as const;

export type ClaudeLoadedSkillReceipt = {
  readonly schemaVersion: typeof CLAUDE_LOADED_SKILL_RECEIPT_SCHEMA_VERSION;
  readonly installedVersion: string;
  readonly loadedSkillSha256: string;
};
const observedSkillReceipts = new WeakSet<ClaudeLoadedSkillReceipt>();

export type ClaudeV2PreflightInput = {
  readonly buildIdentity: BuildIdentity;
  readonly loadedSkillReceipt: ClaudeLoadedSkillReceipt;
  readonly briefSha256: string;
  readonly reviewerLaunchBundle: ReviewerLaunchBundle;
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function createClaudeLoadedSkillReceipt(installedVersion: string, loadedSkillBytes: string): ClaudeLoadedSkillReceipt {
  return Object.freeze({
    schemaVersion: CLAUDE_LOADED_SKILL_RECEIPT_SCHEMA_VERSION,
    installedVersion,
    loadedSkillSha256: sha256(loadedSkillBytes),
  });
}
/**
 * Legacy diagnostic helper. Its structural result is deliberately not registered as an
 * observed host receipt and therefore cannot activate a v2 run.
 */
export function observeClaudeLoadedSkill(
  buildIdentity: BuildIdentity,
  installedVersion: string,
  loadedSkillBytes: string,
): ClaudeLoadedSkillReceipt {
  const receipt = createClaudeLoadedSkillReceipt(installedVersion, loadedSkillBytes);
  if (receipt.installedVersion !== buildIdentity.packageVersion || receipt.loadedSkillSha256 !== buildIdentity.sourceSkillSha256) {
    throw new Error('Claude observed loaded skill does not match the installed build');
  }
  observedSkillReceipts.add(receipt);
  return receipt;
}

export function preflightClaudeV2(input: ClaudeV2PreflightInput): ActivationContext {
  const { buildIdentity, loadedSkillReceipt, briefSha256, reviewerLaunchBundle } = input;
  if (loadedSkillReceipt.schemaVersion !== CLAUDE_LOADED_SKILL_RECEIPT_SCHEMA_VERSION) {
    throw new Error('Claude loaded-skill receipt has an unsupported schema version');
  }
  if (!observedSkillReceipts.has(loadedSkillReceipt)) {
    throw new Error('Claude v2 preflight requires a host-observed loaded-skill/build receipt');
  }
  if (loadedSkillReceipt.installedVersion !== buildIdentity.packageVersion) {
    throw new Error('Claude installed version label does not match the current build');
  }
  if (loadedSkillReceipt.loadedSkillSha256 !== buildIdentity.sourceSkillSha256) {
    throw new Error('Claude loaded skill bytes do not match the current build source skill hash');
  }
  if (reviewerLaunchBundle === undefined) throw new Error('Claude reviewer preflight requires an evidence launch bundle');
  const bundle = reviewerLaunchBundle.adapter.requireLaunchBundle(reviewerLaunchBundle, 'claude');
  if (bundle.loadedSkillReceipt.loadedSkillReceipt !== loadedSkillReceipt) {
    throw new Error('Claude v2 preflight requires the bundle-attached observed loaded-skill receipt');
  }
  if (
    bundle.reviewerLaunchReceipt.buildSha256 !== buildIdentity.buildSha256
    || bundle.reviewerLaunchReceipt.briefSha256 !== briefSha256
    || bundle.loadedSkillReceipt.loadedSkillSha256 !== loadedSkillReceipt.loadedSkillSha256
  ) {
    throw new Error('Claude reviewer launch bundle does not match the current build, loaded skill, and brief');
  }
  bundle.adapter.requireConfiguration(bundle.configuration, bundle.reviewerLaunchReceipt, 'claude');
  return validateActivationContext({
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: buildIdentity.buildSha256,
    loadedSkillSha256: loadedSkillReceipt.loadedSkillSha256,
    briefSha256,
    hostCapability: { host: 'claude' },
  });
}

const yamlScalar = (s: string): string => JSON.stringify(s.replace(/\s*\n\s*/g, ' ').trim());

function emitAgentFile(agent: AbstractAgent): string {
  const frontmatter = [
    '---',
    `name: ${agent.name}`,
    `description: ${yamlScalar(agent.description)}`,
  ];
  if (agent.deny?.length) frontmatter.push(`disallowedTools: ${agent.deny.join(', ')}`);
  frontmatter.push('---', '');
  return `${frontmatter.join('\n')}\n${substitute(agent.instructions)}`;
}
export type ClaudeReviewerIsolation = {
  /** Host-observed launch/session receipt; copied receipts are rejected by the adapter. */
  readonly reviewerLaunchBundle: ReviewerLaunchBundle;
};

function claudeMcpConfig(reviewer: ClaudeReviewerIsolation | undefined): unknown {
  return reviewer === undefined
    ? browserRsMcpConfig()
    : reviewer.reviewerLaunchBundle.adapter.requireLaunchBundle(reviewer.reviewerLaunchBundle, 'claude').configuration;
}


export function emitClaude({
  agents = [],
  buildIdentity,
  reviewer,
}: {
  agents?: AbstractAgent[];
  buildIdentity?: BuildIdentity;
  reviewer?: ClaudeReviewerIsolation;
} = {}): Emitted {
  const files: Record<string, unknown> = {};


  for (const agent of agents) files[`agents/${agent.name}.md`] = emitAgentFile(agent);

  files['.mcp.json'] = claudeMcpConfig(reviewer);

  files['.claude-plugin/plugin.json'] = {
    name: 'oh-my-design',
    description: 'Design cognition loop — frame, diverge, see, reframe',
    skills: './skills/',
    agents: './agents/',
    mcpServers: './.mcp.json',
    ...(buildIdentity === undefined ? {} : { buildIdentity }),
  };

  return { files };
}

// ── Plugin flavor (repo root, marketplace-installed as `oh-my-design`) ──
//
// A marketplace plugin loads skills/agents under its own namespace: an agent installed
// from plugin "oh-my-design" is addressed as `oh-my-design:eye`, not `omd-eye`. The dist/
// emission above stays bare-name for direct/manual installs and must not change. This
// flavor is a second, parallel emission: same agents, same MCP server, but names stripped
// of their "omd-" prefix and cross-references rewritten to the "oh-my-design:" plugin form.

// "omd-scout" is both an agent and a skill name; either pattern maps it to
// "oh-my-design:scout" — harmless overlap, the contexts (subagent spawn vs. skill mention)
// differ. Agent pattern runs first only to keep the read order obvious; running skill
// pattern first would be equally correct since neither pattern's output can match the
// other's input. "omd-figma" is skill-only — it has no agent counterpart.
const AGENT_REF = /\bomd-(composer|framer|eye|glance|hand|scout|sketch|typesetter|writer)\b/g;
const SKILL_REF = /\bomd-(ultradesign|humanize|critique|coach|figma|scout)\b/g;

const pluginizeRefs = (text: string): string => text.replace(AGENT_REF, 'oh-my-design:$1').replace(SKILL_REF, 'oh-my-design:$1');

const stripOmdPrefix = (name: string): string => (name.startsWith('omd-') ? name.slice(4) : name);

function emitAgentFilePlugin(agent: AbstractAgent): string {
  const frontmatter = [
    '---',
    `name: ${stripOmdPrefix(agent.name)}`,
    `description: ${yamlScalar(pluginizeRefs(agent.description))}`,
  ];
  if (agent.deny?.length) frontmatter.push(`disallowedTools: ${agent.deny.join(', ')}`);
  frontmatter.push('---', '');
  return `${frontmatter.join('\n')}\n${pluginizeRefs(substitute(agent.instructions))}`;
}

export function emitClaudePlugin({
  agents = [],
  reviewer,
}: {
  agents?: AbstractAgent[];
  reviewer?: ClaudeReviewerIsolation;
} = {}): Emitted {
  const files: Record<string, unknown> = {};

  for (const agent of agents) files[`agents/${stripOmdPrefix(agent.name)}.md`] = emitAgentFilePlugin(agent);

  files['.mcp.json'] = claudeMcpConfig(reviewer);

  return { files };
}

/**
 * Rewrites one SKILL.md source for the plugin flavor: strips "omd-" from the skill's own
 * `name:` frontmatter (its own identity, stripped bare — same treatment as an agent's own
 * filename/frontmatter), then rewrites every cross-reference to another skill or agent to
 * the "oh-my-design:" plugin form. Both steps run on the whole source, so a skill's
 * description or body mentioning another skill or agent gets the plugin-resolvable form.
 */
export function pluginizeSkill(source: string): { name: string; source: string } {
  const nameLine = /^name:\s*(.+)$/m.exec(source);
  const rawName = (nameLine?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  const bareName = stripOmdPrefix(rawName);

  let rewritten = source;
  if (nameLine) {
    rewritten = rewritten.slice(0, nameLine.index)
      + `name: ${bareName}`
      + rewritten.slice(nameLine.index + nameLine[0].length);
  }
  rewritten = pluginizeRefs(rewritten);

  return { name: bareName, source: rewritten };
}

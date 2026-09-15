import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { brokeredBrowserOperationNames } from '../core/runtime/codex-browser-operation.ts';

function shellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Bind command examples to the issuing package, independently of shell PATH. */
export function codexCliContext(ownerCliPath: string, nodePath = process.execPath, role?: string): string {
  const cli = realpathSync(join(dirname(ownerCliPath), 'omd.ts'));
  const command = `${shellWord(nodePath)} ${shellWord(cli)}`;
  const installer = join(dirname(cli), 'omd-install.ts');
  return [
    'CLI binding: every `omd` command in the role profile or task means the following exact command prefix:',
    command,
    'Append the requested subcommand and arguments to this prefix. Do not use bare `omd`, npx, a PATH shim, another installation, or recursively launch omd-codex exec.',
    'Keep the inherited OMD_ACTIVATION_PATH and role environment unchanged; the issuing CLI reads them directly. Changing the command prefix does not authorize additional operations.',
    'Each delegated role has its own activation path. Omit --activation or expand "$OMD_ACTIVATION_PATH" inside this role process; never substitute a coordinator or earlier role path from task prose.',
    ...(role === 'omd-scout' || role === 'omd-typesetter' ? [
      `Browser capability: this role uses the host-brokered OMD browser CLI. Allowed browser operations: ${brokeredBrowserOperationNames(role).join(', ')}.`,
      'The absence of an interactive browser MCP tool does not mean these commands are unavailable. Use the exact issuing CLI above; the host brokers browser execution with your live role authority. A healthy browser doctor is only an installation check: an actual command and saved capture must still succeed.',
      'This grants no install, provider launch, or authority changes. Preserve the exact command error when it fails; do not start a browser provider, import a session, or substitute another runtime.',
      ...(role === 'omd-scout' ? [
        'Inspect a reachable source with ir/render, then capture its verified selector with ref add or ref add-batch. For an existing state or known disclosure, print `omd schema reference-capture-preparation` and use its supported capture path with energy disabled.',
        'That path permits only explicit disclosure clicks and visibility observations, not arbitrary typing, submission, navigation, or a logged-in session. If a reference cannot expose the required state, report the observed primitive and remaining gap to Framer; do not relabel it or relax the destination behavior.',
      ] : []),
    ] : []),
    ...(existsSync(installer) ? [
      'The read-only `oh-my-design browser doctor --json` health check uses the installer entry point, not an `omd browser` subcommand:',
      `${shellWord(nodePath)} ${shellWord(realpathSync(installer))} browser doctor --json`,
    ] : []),
  ].join('\n');
}

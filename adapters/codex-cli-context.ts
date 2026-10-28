import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadRoleProfile } from '../core/brief/profiles.ts';

function shellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Bind command examples to the issuing package, independently of shell PATH. */
export function codexCliContext(ownerCliPath: string, nodePath = process.execPath, role?: string, roleMode?: string): string {
  const cli = realpathSync(join(dirname(ownerCliPath), 'omd.ts'));
  const command = `${shellWord(nodePath)} ${shellWord(cli)}`;
  const installer = join(dirname(cli), 'omd-install.ts');
  return [
    'CLI binding: every `omd` command in the role profile or task means the following exact command prefix:',
    command,
    'Append the requested subcommand and arguments to this prefix. Do not use bare `omd`, npx, a PATH shim, another installation, or launch a second OMD host process.',
    'Keep the inherited OMD_ACTIVATION_PATH and role environment unchanged; the issuing CLI reads them directly. Changing the command prefix does not authorize additional operations.',
    'Each delegated role has its own activation path. Omit --activation or expand "$OMD_ACTIVATION_PATH" inside this role process; never substitute a coordinator or earlier role path from task prose.',
    ...(roleMode === undefined ? [] : (() => {
      if (!role) throw new Error('role mode requires a role identity');
      const profile = loadRoleProfile(role, roleMode);
      return [`Role profile: ${profile.role}/${profile.mode}; sha256=${profile.sha256}. This text does not issue a role-mode grant.`, profile.source];
    })()),
    ...(existsSync(installer) ? [
      'The read-only `oh-my-design browser doctor --json` health check uses the installer entry point, not an `omd browser` subcommand:',
      `${shellWord(nodePath)} ${shellWord(realpathSync(installer))} browser doctor --json`,
    ] : []),
  ].join('\n');
}

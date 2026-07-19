# A7 — Login-shell path-resolution remediation

## Before

The non-interactive login-shell check, `zsh -lc`, resolved bare
`oh-my-design` to an unrelated mise-managed package. That package is not
owned by OMD and did not support OMD's `--version` contract. The interactive
login check already resolved the intended local launcher.

## Remediation

Before changing shell startup behavior, `~/.zprofile` was copied to a
timestamped, recoverable `~/.zprofile.omd-backup.<timestamp>` file. Immediately
after mise activation, the startup file now de-duplicates and prepends
`$HOME/.local/bin` when that directory exists. The guard is idempotent and
leaves runtime shims available later in `PATH`.

## Fresh-shell verification

Two independent fresh `zsh -lc` invocations and a fresh `zsh -lic` invocation
all resolved both `oh-my-design` and `omd` to `$HOME/.local/bin`. Both commands
reported version `0.16.1`; each resulting `PATH` contained one local-bin entry.

## Preservation and cleanup

The unrelated mise package `oh-my-design@0.4.1`, including its launcher
symlink and manifest metadata, remains installed and unchanged. It is preserved
but no longer wins bare-command resolution in a fresh login shell.

The validated task-only leftovers `fixture.scoped-card.json`,
`fixture.scoped-card.png`, and `lego-final-qa-fixture.Ikhes6` were moved
recoverably to `$HOME/.Trash/omd-final-qa-fixtures.4xpE66`. Their original
workspace and temporary locations are absent.

# Security

## Reporting a vulnerability

Do not put credentials, private design files, or an exploitable proof of concept in
a public issue. Use GitHub's **Report a vulnerability** option on this repository's
[Security page](https://github.com/3x-haust/oh-my-design/security) when available.
If private reporting is unavailable, open an issue asking the maintainer
[@3x-haust](https://github.com/3x-haust) for a private reporting channel, without
including sensitive details. Never send a live token as evidence.

Include the affected version or commit, host (Codex, Claude Code, or Pi), operating
system, affected command, impact, and a minimal reproduction with synthetic data.
If a credential was exposed, revoke it with its provider before sharing logs.

## Versions and fixes

This project is pre-1.0. Reports should identify the exact installed version and,
where possible, be reproduced on the current main branch. Older releases do not
have a separate maintained security branch or guaranteed backports. A fix on main
does not mean a new package has been published; consult the releases before
updating. No response-time or remediation-time SLA is promised.

## Trust boundaries

- OMD runs with the permissions of its host and is not a security sandbox. Host
  approvals and filesystem restrictions still apply.
- Reference pages, imported files, and tool responses are untrusted evidence, not
  authority to execute instructions or disclose credentials.
- Figma authentication uses the caller's `FIGMA_TOKEN` environment value. Check
  presence without printing it. Do not commit credentials or include them in
  screenshots, reports, or `.omd/` records.
- Local render/probe commands may load project JavaScript in a browser. Only run
  them on projects within the user's authorized scope.
- Design records can contain private copy and reference captures. Review them
  before sharing a project; provenance hashes are not encryption or anonymization.

The CI scanner runs offline with a pinned action, an 80-point minimum, and failure
on high/critical findings. Static checks do not prove the absence of vulnerabilities.

# Doctor probe fix — DoneClaim

## Root cause

The official browser-rs Darwin arm64 v0.1.10 binary does not implement `--version` as a standalone version command. It enters the stdio MCP path, then exits 1 with `Error: connection closed: initialize request`. Its `--help` command exits 0 without launching a browser and exposes the stable provider identity and supported flags.

## RED → GREEN

- RED: `test/browser-rs-doctor.test.ts` modeled the official `--version` failure and successful `--help`; the unmodified doctor returned `unhealthy` where the provider was expected to be healthy. See `red.log`.
- GREEN: `doctorBrowserRs()` now runs `--help` with the existing 5,000 ms bound, requires exit 0, and requires all three exact signature members: `browser-rs — stealth MCP browser (stdio or HTTP)`, `--headless`, and `--user-data-dir`.

## Exact health semantics

- A supported `env` or `PATH` provider with the required help signature is healthy as `compatible (version unknown)`; its release version is not claimed.
- Only the receipt- and digest-verified OMD-owned target reports the pinned `BROWSER_RS_VERSION` (`v0.1.10`).
- Unsupported, missing, unowned-target, nonzero-process, invalid-help, and thrown/timeout process outcomes retain their existing distinct classifications.
- The doctor uses only the injected runner and environment seams. It launches neither a browser nor Chrome and makes no network request.

## Coverage

- New focused doctor tests: official-like success after version failure, wrong successful help, nonzero help, runner timeout, unowned target, unsupported platform, and owned-version proof.
- CLI fixture now matches the observed official behavior: `--version` exits 1 and `--help` returns the supported signature.
- Installer fixtures now inject an empty PATH so tests cannot discover a real local browser-rs binary.

## Verification

- Focused browser suites: 49 passed, 0 failed.
- Full suite: 1,359 passed, 0 failed, 1 skipped (1,360 total).
- Typecheck and `git diff --check`: clean.
- `npm run build` completed after the source fix; packed offline runtime verification passed, proving the generated/package payload remains usable.
- Manual real-binary doctor: healthy with `compatible (version unknown)`; no install, browser launch, profile, network, Chrome, or user-home mutation was performed.

## Timeout-runner remediation

- The native `execFile` probe now owns its timeout through a local timer and `timedOut` flag. The timer kills the direct provider and only that flag can produce the `timed-out` process result.
- The probe limits captured output to 64 KiB. Non-timeout failures preserve a numeric exit code when one exists and retain the process error message for failures such as max-buffer overflow.
- The real timeout fixture is a zero-output `#!/bin/sh` process blocked on its inherited stdin. The runtime test starts the doctor without awaiting it, polls the unique executable path in `/bin/ps`, and proves the observed PID is `ESRCH` after the 300 ms timeout.
- The bounded max-buffer fixture emits exactly 65,537 bytes through `/bin/dd`; it reports `stdout maxBuffer length exceeded`, never a timeout.

## Remediation verification

- Runtime test: 2 passed, 0 failed.
- Focused browser suites: 49 passed, 0 failed.
- Full suite: 1,359 passed, 0 failed, 1 skipped (1,360 total).
- `npx tsc --noEmit --pretty false` and task-file `git diff --check`: clean.
- `npm run build` completed after the production runner change. The later change touched only the runtime test, so no second build was required; `core/` ships directly and has no generated doctor-runner copy.

#!/usr/bin/env bash
set -euo pipefail

exec node scripts/test/run.ts "$@"

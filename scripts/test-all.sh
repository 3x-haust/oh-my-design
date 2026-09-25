#!/usr/bin/env bash
set -euo pipefail

isolated=(
  test/benchmark-native-publish.test.ts
  test/benchmark-dependency-snapshot.test.ts
  test/browser-rs-doctor-runtime.test.ts
  test/harness-v2-cli.test.ts
  test/discovery-http-binding.test.ts
  test/cold-start-workflow.test.ts
  test/human-design-loop.test.ts
  test/static-direction-evidence.test.ts
)
node --test --test-concurrency=1 "${isolated[@]}"

remaining=()
for file in test/*.test.ts; do
  case "$file" in
    test/benchmark-native-publish.test.ts|test/benchmark-dependency-snapshot.test.ts|\
    test/browser-rs-doctor-runtime.test.ts|test/harness-v2-cli.test.ts|\
    test/discovery-http-binding.test.ts|test/cold-start-workflow.test.ts|\
    test/human-design-loop.test.ts|test/static-direction-evidence.test.ts) ;;
    *) remaining+=("$file") ;;
  esac
done
node --test --test-concurrency=2 "${remaining[@]}"

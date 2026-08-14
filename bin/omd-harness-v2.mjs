#!/usr/bin/env node
import { runTypeScriptEntry } from './run-ts.mjs';

runTypeScriptEntry(new URL('../scripts/benchmark/run-harness-v2.ts', import.meta.url));

#!/usr/bin/env node
import { runTypeScriptEntry } from './run-ts.mjs';

runTypeScriptEntry(new URL('../adapters/reviewer-mcp.ts', import.meta.url));

#!/usr/bin/env node
import { runTypeScriptEntry } from './run-ts.mjs';

runTypeScriptEntry(new URL('./omd-codex.ts', import.meta.url));

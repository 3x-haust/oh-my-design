#!/usr/bin/env node
import { runTypeScriptEntry } from './run-ts.mjs';

runTypeScriptEntry(new URL('./omd-install.ts', import.meta.url));

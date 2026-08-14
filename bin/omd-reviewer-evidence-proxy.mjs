#!/usr/bin/env node
import { createRequire } from 'node:module';
import { execve } from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const target = fileURLToPath(new URL('../adapters/reviewer-mcp.ts', import.meta.url));
execve(process.execPath, [process.execPath, '--import', require.resolve('tsx'), target, ...process.argv.slice(2)], process.env);

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runCodexHostExec, type CodexHostLaunchResult } from '../adapters/codex-host-launcher.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'bin/omd.mjs');

test('a study completion waits until a signal-resistant background writer can no longer change its source', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-study-quiescence-project-')));
  const runtime = realpathSync(mkdtempSync(join(tmpdir(), 'omd-study-quiescence-runtime-')));
  const codexHome = join(runtime, 'codex-home');
  const report = join(runtime, 'report.json');
  const processReport = join(runtime, 'process.json');
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  const input = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/adaptive-flow/synth-marketing.json'), 'utf8'));
  input.strategyDecision.roles.push('omd-study');
  input.strategyDecision.executionWaves.unshift({ id: 'study', mode: 'concurrent', roles: ['omd-study'] });
  writeFileSync(join(root, '.omd/.cache/route-input.json'), JSON.stringify(input));
  writeFileSync(join(root, '.omd/task.md'), 'Provisional process-boundary fixture, not a model-generated design or quality test.');
  writeFileSync(join(codexHome, 'agents/omd-study.toml'), readFileSync(join(ROOT, 'dist/codex/agents/omd-study.toml')));
  const background = [
    "const fs=require('node:fs');",
    "process.on('SIGTERM',()=>{});",
    "let revision=0; const write=()=>fs.writeFileSync(process.argv[1],String(revision++));",
    "write(); fs.writeFileSync(process.argv[2],'ready'); setInterval(write,10);",
  ].join('\n');
  const stub = join(runtime, 'codex-stub');
  writeFileSync(stub, `#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root=${JSON.stringify(root)};
const run=(cli,args)=>spawnSync(process.execPath,[cli,...args],{cwd:root,env:process.env,encoding:'utf8'});
if(process.env.OMD_NON_PRODUCTION_ROLE==='omd-study') {
  readFileSync(0,'utf8');
  const directory=process.env.OMD_STUDY_OUTPUT_DIR;
  const entry=join(directory,'index.html'); const ready=join(directory,'ready');
  const child=spawn(process.execPath,['-e',${JSON.stringify(background)},entry,ready],{stdio:'ignore'});
  child.unref();
  writeFileSync(${JSON.stringify(processReport)},JSON.stringify({pid:child.pid,entry}));
  const deadline=Date.now()+3000;
  while(!existsSync(ready)) { if(Date.now()>deadline)process.exit(91); await new Promise(r=>setTimeout(r,10)); }
  console.log(JSON.stringify({type:'thread.started',thread_id:'study-background-writer'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:entry}}));
  console.log(JSON.stringify({type:'turn.completed'}));
  process.exit(0);
}
const classified=run(${JSON.stringify(CLI)},['route','classify','--input','.omd/.cache/route-input.json','--json']);
if(classified.status!==0){console.error(classified.stderr);process.exit(1);}
const role=run(${JSON.stringify(join(ROOT, 'bin/omd-codex.mjs'))},['role','run','--agent','omd-study','--input','.omd/task.md','--json']);
writeFileSync(${JSON.stringify(report)},JSON.stringify({status:role.status,stdout:role.stdout,stderr:role.stderr}));
process.exit(role.status??1);
`);
  chmodSync(stub, 0o755);
  let launched: CodexHostLaunchResult | undefined;
  try {
    launched = await runCodexHostExec(['exec', '-C', root, '--skip-git-repo-check', 'Exercise study process boundary'], {
      codexBin: stub, packageRoot: ROOT, codexHome,
      installedSkillRoot: join(ROOT, 'dist/codex/skills'), env: process.env,
    });
    assert.equal(launched.status, 0, launched.stderr);
    const result = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).result, 'completed');
    const processData = JSON.parse(readFileSync(processReport, 'utf8'));
    const atReturn = readFileSync(processData.entry, 'utf8');
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    assert.equal(readFileSync(processData.entry, 'utf8'), atReturn, 'source changed after signed study completion');
    assert.throws(() => process.kill(processData.pid, 0), { code: 'ESRCH' });
  } finally {
    if (existsSync(processReport)) {
      const processData = JSON.parse(readFileSync(processReport, 'utf8'));
      try { process.kill(processData.pid, 'SIGKILL'); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    if (launched) rmSync(launched.authoritySocketPath, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  }
});

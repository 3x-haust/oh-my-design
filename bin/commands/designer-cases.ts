import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { designerCaseCatalog, loadDesignerCase } from '../../core/cases/index.ts';
import { recordDesignerCaseConsultation } from '../../core/design/designer-cases.ts';
import { JUDGMENT_SURFACES, designerJudgmentsMarkdown } from '../../core/design/designer-judgments.ts';
import { canonicalJson, sha256 } from '../../core/ref/board-artifacts.ts';
import { readPersistedRoute } from '../../core/route/adaptive-route-persistence.ts';
import { createProjectWriteAdapter } from '../../core/runtime/project-write.ts';
import { currentNativePiInvocation } from '../cli/runtime.ts';

export function designerCasePack(sub: string | undefined, rest: readonly string[]): void {
  if (sub !== 'cases' && !sub?.startsWith('cases/')) return;
  if (rest.length !== 0) throw new Error('usage: omd pack cases | cases/<id>');
  if (sub === 'cases') {
    process.stdout.write(canonicalJson(designerCaseCatalog()));
    process.exit(0);
  }
  const id = sub.slice('cases/'.length);
  let opened = loadDesignerCase(id);
  const root = process.cwd(), invocation = currentNativePiInvocation();
  if (invocation !== undefined && existsSync(join(root, '.omd/route.json'))) {
    const route = readPersistedRoute(root, invocation);
    opened = recordDesignerCaseConsultation(root, sha256(route.request), id,
      createProjectWriteAdapter(root, invocation));
  }
  process.stdout.write(canonicalJson(opened.case));
  process.exit(0);
}

/** `omd pack judgments [--surface marketing|product]` prints the shipped designer judgments. */
export function designerJudgmentPack(sub: string | undefined, rest: readonly string[]): void {
  if (sub !== 'judgments') return;
  const surface = rest.length === 0 ? 'unspecified' as const
    : rest.length === 2 && rest[0] === '--surface' ? JUDGMENT_SURFACES.find(item => item === rest[1]) : undefined;
  if (surface === undefined) throw new Error('usage: omd pack judgments [--surface marketing|product]');
  process.stdout.write(`${designerJudgmentsMarkdown(surface)}\n`);
  process.exit(0);
}

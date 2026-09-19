import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ProductionReferenceGateEnvironment = Readonly<{
  productionOwnerRole?: string;
}>;

export function requireProductionReferenceInputs(
  projectRoot: string,
  environment: ProductionReferenceGateEnvironment = process.env,
): void {
  if (environment.productionOwnerRole !== 'omd-hand') return;

  const omdRoot = join(projectRoot, '.omd');
  const routePath = join(omdRoot, 'route.json');
  if (!existsSync(routePath)) {
    throw new Error('PRODUCTION_REFERENCE_GATE: route.json is required before source writes');
  }

  let route: { projectMode?: unknown };
  try {
    route = JSON.parse(readFileSync(routePath, 'utf8')) as { projectMode?: unknown };
  } catch {
    throw new Error('PRODUCTION_REFERENCE_GATE: route.json is unreadable');
  }
  if (route.projectMode !== 'greenfield') return;

  const boardPath = join(omdRoot, 'reference-board.json');
  const refsPath = join(omdRoot, 'refs');
  if (!existsSync(boardPath) || !existsSync(refsPath)
    || !readdirSync(refsPath).some((entry) => !entry.startsWith('.'))) {
    throw new Error('PRODUCTION_REFERENCE_GATE: greenfield source writes require .omd/reference-board.json and non-empty .omd/refs/');
  }
}

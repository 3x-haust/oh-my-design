import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  type CallExpression,
  type Node,
  type SourceFile,
  isBinaryExpression,
  isCallExpression,
  isElementAccessExpression,
  isIdentifier,
  isExportDeclaration,
  isImportDeclaration,
  isNamespaceImport,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isNumericLiteral,
  isParenthesizedExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isVariableDeclaration,
  isVariableStatement,
  SyntaxKind,
} from 'typescript/unstable/ast';
import { API } from 'typescript/unstable/sync';

export type ProjectRunMutationClassification = 'guarded' | 'external-exception' | 'unclassified';

export type ProjectRunMutationOwner = {
  readonly filePath: string;
  readonly classification: ProjectRunMutationClassification;
  readonly exception?: string;
};

export type UnguardedProjectMutation = {
  readonly filePath: string;
  readonly line: number;
  readonly operation: string;
  readonly sourceLine: string;
};

export type ProjectWriteInventory = {
  readonly owners: readonly ProjectRunMutationOwner[];
  readonly unguardedMutations: readonly UnguardedProjectMutation[];
};

export class ProjectWriteInventoryError extends Error {
  override readonly name = 'ProjectWriteInventoryError';

  readonly mutations: readonly UnguardedProjectMutation[];

  constructor(mutations: readonly UnguardedProjectMutation[]) {
    super(`unclassified direct project mutations:\n${mutations
      .map((mutation) => `- ${mutation.filePath}:${mutation.line} ${mutation.operation}: ${mutation.sourceLine.trim()}`)
      .join('\n')}`);
    this.mutations = mutations;
  }
}

const MUTATING_OPERATIONS = [
  'appendFile', 'appendFileSync', 'chmod', 'chmodSync', 'chown', 'chownSync',
  'copyFile', 'copyFileSync', 'cp', 'cpSync', 'fchmod', 'fchmodSync', 'fchown',
  'fchownSync', 'link', 'linkSync', 'lchmod', 'lchmodSync', 'lchown', 'lchownSync',
  'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync', 'open', 'openSync', 'rename',
  'renameSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'symlink', 'symlinkSync',
  'truncate', 'truncateSync', 'unlink', 'unlinkSync', 'utimes', 'utimesSync',
  'writeFile', 'writeFileSync', 'write', 'writeSync',
] as const;
const READ_ONLY_OPEN_STRINGS = new Set(['r', 'rs']);
const READ_ONLY_OPEN_CONSTANTS = new Set([
  'O_RDONLY', 'O_NOFOLLOW', 'O_DIRECTORY', 'O_NONBLOCK', 'O_NOATIME',
  'O_CLOEXEC', 'O_DIRECT', 'O_DSYNC', 'O_SYNC', 'O_RSYNC', 'O_PATH',
]);

const GUARD_BOUNDARY = 'core/runtime/project-write.ts';
const EXTERNAL_OBSERVATION_WRAPPER = 'writeExternalObservationFile/createExternalObservationDirectory';
const REVIEWER_LIVE_SOCKET_ADAPTER = 'adapters/reviewer-mcp.ts';
const REVIEWER_LIVE_SOCKET_EXCEPTION = 'reviewer proxy live-socket cleanup (audited in-memory broker)';
const FINAL_EVIDENCE_STABLE_DESCRIPTOR_ADAPTER = 'core/evidence/final-v2.ts';
const FINAL_EVIDENCE_STABLE_DESCRIPTOR_EXCEPTION = 'final-evidence-v2 stable descriptor adapter (audited capability owner)';
const GUARD_ENTRYPOINTS = [
  'writeExternalObservationFile',
  'createExternalObservationDirectory',
  'writeProjectFile',
  'writeImmutableProjectFile',
  'replaceProjectFileAtomically',
  'createProjectDirectory',
  'createProjectWriteAdapter',
] as const;

function reviewerLiveSocketCleanupException(
  filePath: string,
  source: string,
  directMutations: readonly UnguardedProjectMutation[],
): boolean {
  const removeSocket = functionBody(source, 'removeSocket');
  const closeBroker = functionBody(source, 'closeBroker');
  const startBroker = functionBody(source, 'startBroker');
  const consumeBroker = functionBody(source, 'consumeBrokerEvidence');
  const removeSocketCalls = source.match(/\bremoveSocket\(/g)?.length ?? 0;
  const closeBrokerCleanup = closeBroker === undefined
    ? false
    : [
        'launchCapabilities.delete(launch.receipt);',
        'launchEnvironments.delete(launch.receipt);',
        'launch.evidence.fill(0);',
        "launch.capability = '';",
        'const path = socketPath(launchId);',
        'removeSocket(path);',
      ].every((sourceLine, index, lines) => {
        const previous = index === 0 ? -1 : closeBroker.indexOf(lines[index - 1]!);
        return closeBroker.indexOf(sourceLine) > previous;
      });
  return filePath === REVIEWER_LIVE_SOCKET_ADAPTER
    && directMutations.length === 1
    && directMutations[0]?.operation === 'unlinkSync'
    && directMutations[0]?.sourceLine.trim() === 'if (existsSync(path)) unlinkSync(path);'
    && source.includes('const temporaryRoot = realpathSync(tmpdir());')
    && source.includes("const socketPath = (launchId: string): string => join(temporaryRoot, `o-${createHash('sha256').update(launchId).digest('hex').slice(0, 16)}`);")
    && source.includes('type BrokerLaunch = {\n  readonly receipt: ReviewerLaunchReceipt;\n  evidence: Uint8Array;\n  capability: string;')
    && source.includes('const localLaunches = new Map<string, BrokerLaunch>();')
    && source.includes('localLaunches.set(launchId, launch);')
    && removeSocket?.trim() === 'if (existsSync(path)) unlinkSync(path);'
    && removeSocketCalls === 4
    && closeBroker?.includes('const path = socketPath(launchId);') === true
    && closeBroker?.includes('launch.server.close(() => removeSocket(path));') === true
    && closeBrokerCleanup
    && startBroker?.includes('const path = socketPath(launch.receipt.launchId);') === true
    && startBroker?.includes('removeSocket(path);') === true
    && startBroker?.includes("server.once('error', () => closeBroker(launch.receipt.launchId));") === true
    && startBroker?.includes('closeBroker(launch.receipt.launchId);') === true
    && consumeBroker?.includes('const launchCapability = process.env.OMD_REVIEWER_EVIDENCE_LAUNCH_CAPABILITY;') === true
    && consumeBroker?.includes('delete process.env.OMD_REVIEWER_EVIDENCE_LAUNCH_CAPABILITY;') === true
    && consumeBroker?.includes("if (!launchCapability) throw new ReviewerLaunchError('reviewer proxy lacks the private host launch capability');") === true
    && consumeBroker?.includes('const socket = connect(brokerSocket);') === true;
}
function finalEvidenceStableDescriptorAdapter(
  filePath: string,
  source: string,
  directMutations: readonly UnguardedProjectMutation[],
): boolean {
  return filePath === FINAL_EVIDENCE_STABLE_DESCRIPTOR_ADAPTER
    && directMutations.length === 1
    && directMutations[0]?.operation === 'writeSync'
    && directMutations[0]?.sourceLine.trim() === 'mkdir: mkdirSync, open: openSync, write: (fd, bytes) => { writeSync(fd, bytes); }, writeFile: writeFileSync, readFile: readFileSync, rename: renameSync, link: linkSync,'
    && functionBody(source, 'filesystem')?.includes('const defaults: FinalEvidenceV2FileSystem = {') === true
    && functionBody(source, 'filesystem')?.includes('write: (fd, bytes) => { writeSync(fd, bytes); }') === true
    && functionBody(source, 'filesystem')?.includes('return { ...defaults, ...seams.fs };') === true;
}
function sourcePath(repositoryRoot: string, absolutePath: string): string {
  return relative(repositoryRoot, absolutePath).split('\\').join('/');
}

function resolveImport(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(from), specifier);
  const candidates = [base, `${base}.ts`, resolve(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate));
}

function importsFor(source: string): readonly string[] {
  const imports = new Set<string>();
  const staticImport = /\bimport\s+(?:type\s+)?(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const staticExport = /\bexport\s+(?:\*\s+|\{[^}]*\}\s+)from\s+['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(staticImport)) {
    const specifier = match[1];
    if (specifier !== undefined) imports.add(specifier);
  }
  for (const match of source.matchAll(staticExport)) {
    const specifier = match[1];
    if (specifier !== undefined) imports.add(specifier);
  }
  for (const match of source.matchAll(dynamicImport)) {
    const specifier = match[1];
    if (specifier !== undefined) imports.add(specifier);
  }
  return [...imports];
}
const inventoryParser = new API();

function parseSourceFile(absolutePath: string, source: string): SourceFile {
  const snapshot = inventoryParser.updateSnapshot({ openFiles: [absolutePath] });
  try {
    const project = snapshot.getDefaultProjectForFile(absolutePath);
    const sourceFile = project?.program.getSourceFile(absolutePath);
    if (!project || !sourceFile || sourceFile.text !== source
      || project.program.getSyntacticDiagnostics(absolutePath).length > 0) {
      throw new TypeError(`unable to parse project mutation source: ${absolutePath}`);
    }
    return sourceFile;
  } finally {
    snapshot.dispose();
  }
}

type FsBindings = {
  readonly functions: ReadonlyMap<string, string>;
  readonly namespaces: ReadonlySet<string>;
  readonly adapters: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly constants: ReadonlySet<string>;
  readonly unrecognizedImports: readonly { line: number; sourceLine: string }[];
};

function fsBindings(source: string, absolutePath: string): FsBindings {
  const functions = new Map<string, string>();
  const namespaces = new Set<string>();
  const constants = new Set<string>();
  const adapters = new Map<string, Map<string, string>>();
  const unrecognizedImports: { line: number; sourceLine: string }[] = [];
  const file = parseSourceFile(absolutePath, source);
  const lines = source.split(/\r?\n/);
  const lineAt = (node: Node): number => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const sourceLineAt = (node: Node): string => lines[lineAt(node) - 1] ?? '';
  const mutating = new Set<string>(MUTATING_OPERATIONS);

  for (const statement of file.statements) {
    const moduleSpecifier = isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
    if (isExportDeclaration(statement)
      && moduleSpecifier !== undefined
      && isStringLiteral(moduleSpecifier)
      && (moduleSpecifier.text === 'node:fs' || moduleSpecifier.text === 'node:fs/promises')) {
      // Re-exporting an fs capability makes its eventual consumer opaque to this
      // file-local binding analysis. Reject the capability at its first boundary,
      // including `export *`, rather than allowing a second module to invoke it.
      unrecognizedImports.push({ line: lineAt(statement), sourceLine: sourceLineAt(statement) });
      continue;
    }
    if (isImportDeclaration(statement)
      && isStringLiteral(statement.moduleSpecifier)
      && (statement.moduleSpecifier.text === 'node:fs' || statement.moduleSpecifier.text === 'node:fs/promises')) {
      const clause = statement.importClause;
      if (!clause || clause.phaseModifier === SyntaxKind.TypeKeyword) continue;
      if (clause.name) namespaces.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (!bindings) {
        if (!clause.name) unrecognizedImports.push({ line: lineAt(statement), sourceLine: sourceLineAt(statement) });
        continue;
      }
      if (isNamespaceImport(bindings)) {
        namespaces.add(bindings.name.text);
        continue;
      }
      for (const element of bindings.elements) {
        if (!isIdentifier(element.name)) {
          unrecognizedImports.push({ line: lineAt(element), sourceLine: sourceLineAt(element) });
          continue;
        }
        const imported = element.propertyName?.text ?? element.name.text;
        if (imported === 'constants') constants.add(element.name.text);
        if (mutating.has(imported)) functions.set(element.name.text, imported);
      }
    }
    if (isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (!isIdentifier(declaration.name)
          || !initializer
          || !isCallExpression(initializer)
          || !isIdentifier(initializer.expression)
          || initializer.expression.text !== 'require'
          || initializer.arguments.length !== 1) continue;
        const [moduleSpecifier] = initializer.arguments;
        if (!moduleSpecifier
          || !isStringLiteral(moduleSpecifier)
          || !['node:fs', 'node:fs/promises'].includes(moduleSpecifier.text)) continue;
        unrecognizedImports.push({ line: lineAt(statement), sourceLine: sourceLineAt(statement) });
      }
    }
  }

  const declarations: Node[] = [];
  const collect = (node: Node): void => { if (isVariableDeclaration(node)) declarations.push(node); node.forEachChild(collect); };
  collect(file);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of declarations) {
      if (!isVariableDeclaration(node) || !node.initializer) continue;
      const { initializer, name } = node;
      if (isIdentifier(name) && isIdentifier(initializer) && namespaces.has(initializer.text) && !namespaces.has(name.text)) {
        namespaces.add(name.text); changed = true; continue;
      }
      if (isIdentifier(name) && isIdentifier(initializer) && functions.has(initializer.text) && !functions.has(name.text)) {
        functions.set(name.text, functions.get(initializer.text)!); changed = true; continue;
      }
      if (isIdentifier(name) && isIdentifier(initializer) && constants.has(initializer.text) && !constants.has(name.text)) {
        constants.add(name.text); changed = true; continue;
      }
      if (isIdentifier(name) && isIdentifier(initializer) && adapters.has(initializer.text) && !adapters.has(name.text)) {
        adapters.set(name.text, new Map(adapters.get(initializer.text)!)); changed = true; continue;
      }
      if (isObjectBindingPattern(name) && isIdentifier(initializer) && adapters.has(initializer.text)) {
        const adapter = adapters.get(initializer.text)!;
        for (const element of name.elements) {
          const propertyName = element.propertyName;
          if (!element.name
            || (propertyName !== undefined && !isIdentifier(propertyName) && !isStringLiteral(propertyName))
            || !isIdentifier(element.name)) {
            unrecognizedImports.push({ line: lineAt(element), sourceLine: sourceLineAt(element) });
            continue;
          }
          const property = propertyName?.text ?? element.name.text;
          const operation = adapter.get(property);
          if (operation && !functions.has(element.name.text)) { functions.set(element.name.text, operation); changed = true; }
        }
      }
      if (isIdentifier(name) && isPropertyAccessExpression(initializer) && isIdentifier(initializer.expression)
        && namespaces.has(initializer.expression.text) && mutating.has(initializer.name.text) && !functions.has(name.text)) {
        functions.set(name.text, initializer.name.text); changed = true; continue;
      }
      if (isObjectBindingPattern(name) && isIdentifier(initializer) && namespaces.has(initializer.text)) {
        unrecognizedImports.push({ line: lineAt(node), sourceLine: sourceLineAt(node) });
        continue;
      }
      if (isIdentifier(name) && isObjectLiteralExpression(initializer) && !adapters.has(name.text)) {
        const properties = new Map<string, string>();
        for (const property of initializer.properties) {
          if (isShorthandPropertyAssignment(property)) {
            if (!isIdentifier(property.name)) {
              unrecognizedImports.push({ line: lineAt(property), sourceLine: sourceLineAt(property) });
              continue;
            }
            if (functions.has(property.name.text)) {
              properties.set(property.name.text, functions.get(property.name.text)!);
            }
            continue;
          }
          if (!isPropertyAssignment(property)) continue;
          const operation = isIdentifier(property.initializer)
            ? functions.get(property.initializer.text)
            : isPropertyAccessExpression(property.initializer)
              && isIdentifier(property.initializer.expression)
              && namespaces.has(property.initializer.expression.text)
              && mutating.has(property.initializer.name.text)
              ? property.initializer.name.text
              : undefined;
          if (!operation) continue;
          if (!isIdentifier(property.name) && !isStringLiteral(property.name)) {
            unrecognizedImports.push({ line: lineAt(property), sourceLine: sourceLineAt(property) });
            continue;
          }
          properties.set(property.name.text, operation);
        }
        if (properties.size > 0) { adapters.set(name.text, properties); changed = true; }
      }
    }
  }
  const exportsFsCapability = (node: Node): boolean => {
    if (isIdentifier(node) && (functions.has(node.text) || adapters.has(node.text))) return true;
    if (isPropertyAccessExpression(node)
      && isIdentifier(node.expression)
      && namespaces.has(node.expression.text)
      && mutating.has(node.name.text)) return true;
    if (isPropertyAccessExpression(node)
      && isIdentifier(node.expression)
      && node.expression.text === 'Reflect'
      && node.name.text === 'apply') return true;
    let found = false;
    node.forEachChild((child) => { if (!found && exportsFsCapability(child)) found = true; });
    return found;
  };
  for (const statement of file.statements) {
    if (!isVariableStatement(statement)
      || !statement.modifiers?.some((modifier) => modifier.kind === SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!isIdentifier(declaration.name)
        || (!functions.has(declaration.name.text) && !adapters.has(declaration.name.text)
          && (!declaration.initializer || !exportsFsCapability(declaration.initializer)))) continue;
      unrecognizedImports.push({ line: lineAt(declaration), sourceLine: sourceLineAt(declaration) });
    }
  }
  for (const statement of file.statements) {
    if (isExportDeclaration(statement) && statement.moduleSpecifier === undefined) {
      unrecognizedImports.push({ line: lineAt(statement), sourceLine: sourceLineAt(statement) });
    }
  }
  return { functions, namespaces, adapters, constants, unrecognizedImports };
}

function isReadOnlyOpenFlags(node: Node, bindings: FsBindings): boolean {
  if (isStringLiteral(node)) return READ_ONLY_OPEN_STRINGS.has(node.text);
  if (isNumericLiteral(node)) return Number(node.text) === 0;
  if (isParenthesizedExpression(node)) return isReadOnlyOpenFlags(node.expression, bindings);
  if (isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.BarToken) {
    return isReadOnlyOpenFlags(node.left, bindings) && isReadOnlyOpenFlags(node.right, bindings);
  }
  if (!isPropertyAccessExpression(node) || !READ_ONLY_OPEN_CONSTANTS.has(node.name.text)) return false;
  if (isIdentifier(node.expression)) return bindings.constants.has(node.expression.text);
  return isPropertyAccessExpression(node.expression)
    && isIdentifier(node.expression.expression)
    && bindings.namespaces.has(node.expression.expression.text)
    && node.expression.name.text === 'constants';
}

function isMutatingOpenCall(node: CallExpression, operation: string, bindings: FsBindings): boolean {
  return !['open', 'openSync'].includes(operation) || !node.arguments[1] || !isReadOnlyOpenFlags(node.arguments[1], bindings);
}

function directFsMutations(filePath: string, source: string, absolutePath: string): readonly UnguardedProjectMutation[] {
  const bindings = fsBindings(source, absolutePath);
  const file = parseSourceFile(absolutePath, source);
  const lines = source.split(/\r?\n/);
  const mutations: UnguardedProjectMutation[] = bindings.unrecognizedImports.map(({ line, sourceLine }) => ({
    filePath, line, operation: 'unrecognized node:fs import', sourceLine,
  }));
  const operationAt = (node: Node): { operation: string; dynamic: boolean } | undefined => {
    if (isIdentifier(node) && bindings.functions.has(node.text)) {
      const operation = bindings.functions.get(node.text);
      if (operation) return { operation, dynamic: false };
    }
    if (isPropertyAccessExpression(node) && isIdentifier(node.expression)) {
      const operation = bindings.adapters.get(node.expression.text)?.get(node.name.text);
      if (operation) return { operation, dynamic: false };
    }
    if (isPropertyAccessExpression(node) && isIdentifier(node.expression) && bindings.namespaces.has(node.expression.text)) {
      return MUTATING_OPERATIONS.includes(node.name.text as typeof MUTATING_OPERATIONS[number])
        ? { operation: node.name.text, dynamic: false }
        : undefined;
    }
    if (isPropertyAccessExpression(node)
      && isPropertyAccessExpression(node.expression)
      && isIdentifier(node.expression.expression)
      && bindings.namespaces.has(node.expression.expression.text)
      && node.expression.name.text === 'promises') {
      return MUTATING_OPERATIONS.includes(node.name.text as typeof MUTATING_OPERATIONS[number])
        ? { operation: node.name.text, dynamic: false }
        : undefined;
    }
    if (isElementAccessExpression(node) && isIdentifier(node.expression) && bindings.namespaces.has(node.expression.text)) {
      return { operation: 'dynamic node:fs access', dynamic: true };
    }
    return undefined;
  };
  const visit = (node: Node): void => {
    if (isCallExpression(node)) {
      const match = operationAt(node.expression);
      const reflectApply = isPropertyAccessExpression(node.expression)
        && isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'Reflect'
        && node.expression.name.text === 'apply'
        && node.arguments[0] !== undefined
        ? operationAt(node.arguments[0])
        : undefined;
      const operation = reflectApply === undefined
        ? match
        : { operation: reflectApply.operation, dynamic: true };
      if (operation && (operation.dynamic || (MUTATING_OPERATIONS.includes(operation.operation as typeof MUTATING_OPERATIONS[number])
        && isMutatingOpenCall(node, operation.operation, bindings)))) {
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        mutations.push({ filePath, line, operation: operation.dynamic ? `dynamic ${operation.operation}` : operation.operation, sourceLine: lines[line - 1] ?? '' });
      }
    }
    node.forEachChild(visit);
  };
  visit(file);
  return mutations;
}
function functionBody(source: string, name: string): string | undefined {
  const signature = new RegExp(`(?:export\\s+)?function\\s+${name}\\b`).exec(source);
  if (!signature) return undefined;
  const opening = source.indexOf('{', signature.index);
  if (opening < 0) return undefined;
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(opening + 1, index);
    }
  }
  return undefined;
}

function guardBoundaryFailures(filePath: string, source: string): readonly UnguardedProjectMutation[] {
  return GUARD_ENTRYPOINTS.flatMap((name) => {
    const body = functionBody(source, name);
    if (body?.includes('requireGuardedProjectWrite(')) return [];
    return [{
      filePath,
      line: 1,
      operation: 'missing project-write guard',
      sourceLine: `export function ${name}`,
    }];
  });
}


/**
 * Traverses the real TypeScript import graph rooted at bin/omd.ts. Caller-provided
 * snippets are intentionally unsupported: this inventory is a structural check of
 * the CLI mutation graph, including dynamic relative imports.
 */
export function inventoryProjectRunMutations(
  repositoryRoot: string,
  entrypoint = 'bin/omd.ts',
): ProjectWriteInventory {
  const root = resolve(repositoryRoot);
  const pending = [resolve(root, entrypoint)];
  const visited = new Set<string>();
  const owners: ProjectRunMutationOwner[] = [];
  const unguardedMutations: UnguardedProjectMutation[] = [];

  while (pending.length > 0) {
    const absolutePath = pending.pop()!;
    if (visited.has(absolutePath)) continue;
    visited.add(absolutePath);
    if (!existsSync(absolutePath)) {
      throw new TypeError(`project mutation entrypoint does not exist: ${sourcePath(root, absolutePath)}`);
    }
    const source = readFileSync(absolutePath, 'utf8');
    const filePath = sourcePath(root, absolutePath);
    const directMutations = directFsMutations(filePath, source, absolutePath);
    const guardFailures = filePath === GUARD_BOUNDARY ? guardBoundaryFailures(filePath, source) : [];
    const unsupportedGuardImports = filePath === GUARD_BOUNDARY
      ? directMutations.filter((mutation) => mutation.operation === 'unrecognized node:fs import'
        || mutation.operation === 'dynamic node:fs access')
      : [];
    const reviewerLiveSocketException = reviewerLiveSocketCleanupException(filePath, source, directMutations);
    const finalEvidenceDescriptorAdapter = finalEvidenceStableDescriptorAdapter(filePath, source, directMutations);
    const hasExternalObservationWrapper = filePath === GUARD_BOUNDARY
      && source.includes('export function writeExternalObservationFile')
      && source.includes('export function createExternalObservationDirectory');
    const classification: ProjectRunMutationClassification = filePath === GUARD_BOUNDARY
      && guardFailures.length === 0
      && unsupportedGuardImports.length === 0
      ? 'guarded'
      : reviewerLiveSocketException
        ? 'external-exception'
        : finalEvidenceDescriptorAdapter
          ? 'external-exception'
          : 'unclassified';
    const exception = hasExternalObservationWrapper
      ? EXTERNAL_OBSERVATION_WRAPPER
      : reviewerLiveSocketException
        ? REVIEWER_LIVE_SOCKET_EXCEPTION
        : finalEvidenceDescriptorAdapter
          ? FINAL_EVIDENCE_STABLE_DESCRIPTOR_EXCEPTION
          : undefined;
    owners.push({
      filePath,
      classification,
      ...(exception ? { exception } : {}),
    });
    if (classification === 'unclassified') {
      unguardedMutations.push(...directMutations, ...guardFailures);
    }
    for (const specifier of importsFor(source)) {
      const imported = resolveImport(absolutePath, specifier);
      if (imported) pending.push(imported);
    }
  }

  owners.sort((left, right) => left.filePath.localeCompare(right.filePath));
  unguardedMutations.sort((left, right) => left.filePath.localeCompare(right.filePath) || left.line - right.line);
  return { owners, unguardedMutations };
}

export function assertProjectRunMutationInventory(
  repositoryRoot: string,
  entrypoint?: string,
): ProjectWriteInventory {
  const inventory = inventoryProjectRunMutations(repositoryRoot, entrypoint);
  if (inventory.unguardedMutations.length > 0) throw new ProjectWriteInventoryError(inventory.unguardedMutations);
  return inventory;
}

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  createReadStream,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  type Stats,
} from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Some built pages cannot be rendered from `file://` at all, and they fail silently.
 *
 * Chromium refuses ES modules over `file://` (opaque origin, CORS), and a `default-src 'self'` CSP
 * blocks its own assets there too. Every Vite/electron-vite/Next build emits exactly that shape, so
 * `omd render out/renderer/index.html` produced a blank white screenshot — and then the IR, the
 * completeness check, and the review all judged an empty page and reported it as a design result.
 * A blank render must never be mistaken for a design; serving the directory over loopback is what
 * makes the built app render the way it actually runs.
 */
export function requiresHttpOrigin(html: string): boolean {
  return /<script[^>]+type\s*=\s*["']module["']/i.test(html)
    || /http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(html);
}

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};
const NON_PRODUCT_DIRECTORIES = new Set(['.git', '.omd']);

export type LocalOrigin = {
  readonly origin: string;
  close(): Promise<void>;
};

type OpenedFile = Readonly<{ fd: number; path: string; stat: Stats }>;
const identity = (stat: Stats): string =>
  `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;

function safeRelativePath(value: string, label: string): string {
  if (value === '' || value.includes('\\') || value.includes('\0') || value.startsWith('/')
    || /^[A-Za-z]:\//.test(value)
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  return value;
}

/** Opens a regular file while rejecting a symlink at the root, every ancestor, and the file. */
function openNoFollow(rootInput: string, relativePath: string): OpenedFile {
  const root = resolve(rootInput);
  const path = safeRelativePath(relativePath, 'served path');
  const descriptors: number[] = [];
  try {
    const rootEntry = lstatSync(root);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) throw new Error('served root must be a non-symlink directory');
    const rootFd = openSync(root, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    descriptors.push(rootFd);
    const ancestors = [{ path: root, identity: identity(fstatSync(rootFd)) }];
    let current = root;
    const segments = path.split('/');
    for (const segment of segments.slice(0, -1)) {
      current = join(current, segment);
      const fd = openSync(current, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      descriptors.push(fd);
      const stat = fstatSync(fd);
      if (!stat.isDirectory()) throw new Error('served path ancestor is not a directory');
      ancestors.push({ path: current, identity: identity(stat) });
    }
    const target = join(root, ...segments);
    const fd = openSync(target, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      closeSync(fd);
      throw new Error('served path is not a regular file');
    }
    const entry = lstatSync(target);
    if (!entry.isFile() || entry.isSymbolicLink() || identity(entry) !== identity(stat)) {
      closeSync(fd);
      throw new Error('served path changed while opening');
    }
    for (const ancestor of ancestors) {
      const observed = lstatSync(ancestor.path);
      if (!observed.isDirectory() || observed.isSymbolicLink() || identity(observed) !== ancestor.identity) {
        closeSync(fd);
        throw new Error('served path ancestor changed while opening');
      }
    }
    return { fd, path: target, stat };
  } finally {
    for (const fd of descriptors.reverse()) closeSync(fd);
  }
}

/** Reads one project-relative file through the same no-follow boundary used by loopback serving. */
export function readLocalFileNoFollow(root: string, relativePath: string): Buffer {
  const opened = openNoFollow(root, relativePath);
  try {
    const bytes = readFileSync(opened.fd);
    const after = fstatSync(opened.fd);
    if (identity(after) !== identity(opened.stat) || bytes.length !== opened.stat.size) {
      throw new Error('served path changed while reading');
    }
    return bytes;
  } finally {
    closeSync(opened.fd);
  }
}

type ProjectTreeSnapshot = Readonly<{
  root: string;
  files: ReadonlyMap<string, Buffer>;
  identities: ReadonlyMap<string, string>;
  sha256: string;
}>;

/** Materializes the complete served tree through no-follow descriptors before any consumer starts. */
function materializeProjectTree(root: string, entryPath: string): ProjectTreeSnapshot {
  const safeEntry = safeRelativePath(entryPath, 'production entry');
  const projectRoot = resolve(root);
  const absoluteEntry = resolve(projectRoot, safeEntry);
  const rel = relative(projectRoot, absoluteEntry);
  if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('production entry escapes the project root');
  // Validate the project-root ancestry independently from the served subtree.
  readLocalFileNoFollow(projectRoot, safeEntry);
  const servedRoot = dirname(absoluteEntry);
  const files = new Map<string, Buffer>();
  const identities = new Map<string, string>();
  const digest = createHash('sha256');
  const walk = (directory: string, prefix: string): void => {
    const before = lstatSync(directory);
    if (!before.isDirectory() || before.isSymbolicLink()) throw new Error('served dependency directory is a symlink or special file');
    for (const name of readdirSync(directory).sort()) {
      if (prefix === '' && NON_PRODUCT_DIRECTORIES.has(name)) continue;
      const absolute = join(directory, name);
      const entry = lstatSync(absolute);
      if (entry.isSymbolicLink()) throw new Error('served dependency is a symlink');
      const path = prefix === '' ? name : `${prefix}/${name}`;
      if (entry.isDirectory()) {
        walk(absolute, path);
      } else if (entry.isFile()) {
        const opened = openNoFollow(servedRoot, path);
        try {
          const bytes = readFileSync(opened.fd);
          const after = fstatSync(opened.fd);
          if (identity(after) !== identity(opened.stat) || bytes.length !== opened.stat.size) {
            throw new Error('served dependency changed while materializing');
          }
          const immutableBytes = Buffer.from(bytes);
          files.set(path, immutableBytes);
          identities.set(path, identity(opened.stat));
          digest.update(path).update('\0').update(String(immutableBytes.byteLength)).update('\0').update(immutableBytes);
        } finally {
          closeSync(opened.fd);
        }
      } else {
        throw new Error('served dependency is not a regular file');
      }
    }
    const after = lstatSync(directory);
    if (!after.isDirectory() || after.isSymbolicLink() || identity(after) !== identity(before)) {
      throw new Error('served dependency directory changed while materializing');
    }
    if (prefix !== '') identities.set(`${prefix}/`, identity(before));
  };
  walk(servedRoot, '');
  if (!files.has(basename(absoluteEntry))) throw new Error('production entry is not in the served manifest');
  return Object.freeze({ root: servedRoot, files, identities, sha256: digest.digest('hex') });
}

/** Hashes the exact immutable byte manifest exposed by `serveProjectEntry`. */
export function servedProjectTreeSha256(root: string, entryPath: string): string {
  return materializeProjectTree(root, entryPath).sha256;
}

/**
 * Serve one directory on loopback for the life of a render. Bound to 127.0.0.1 on an ephemeral
 * port, read-only, refuses traversal, and never follows symlinks in the served tree.
 */
export async function serveDirectory(directory: string): Promise<LocalOrigin> {
  const root = resolve(directory);
  const rootEntry = lstatSync(root);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new Error('local render root must be a non-symlink directory');
  }
  const server: Server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let requested: string;
    try {
      requested = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    } catch (error) {
      if (error instanceof URIError || error instanceof TypeError) {
        response.writeHead(400).end();
        return;
      }
      throw error;
    }
    const path = requested.replace(/^\//, '');
    let opened: OpenedFile;
    try {
      opened = openNoFollow(root, path);
    } catch {
      response.writeHead(404).end();
      return;
    }
    const firstSegment = requested.split('/').filter(Boolean)[0];
    if (firstSegment !== undefined && NON_PRODUCT_DIRECTORIES.has(firstSegment)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(opened.path).toLowerCase()] ?? 'application/octet-stream',
      'content-length': opened.stat.size,
      'x-content-type-options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      closeSync(opened.fd);
      response.end();
      return;
    }
    const stream = createReadStream(opened.path, { fd: opened.fd, autoClose: true });
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>((done) => server.close(() => done()));
    throw new Error('local render server did not bind a port');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((done) => {
      server.closeAllConnections?.();
      server.close(() => done());
    }),
  };
}

async function serveProjectSnapshot(snapshot: ProjectTreeSnapshot, navigationFallback?: string): Promise<LocalOrigin> {
  const server: Server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    let path: string;
    try {
      const requested = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      path = requested === '/' && navigationFallback ? navigationFallback : safeRelativePath(requested.replace(/^\//, ''), 'served path');
    } catch {
      response.writeHead(404).end();
      return;
    }
    const firstSegment = path.split('/')[0];
    if (firstSegment !== undefined && NON_PRODUCT_DIRECTORIES.has(firstSegment)) {
      response.writeHead(404).end();
      return;
    }
    const fallback = navigationFallback && request.headers['sec-fetch-dest'] === 'document' && !extname(path) ? navigationFallback : undefined;
    const selected = snapshot.files.has(path) ? path : fallback ?? path;
    const bytes = snapshot.files.get(selected);
    if (bytes === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(selected).toLowerCase()] ?? 'application/octet-stream',
      'content-length': bytes.byteLength,
      'x-content-type-options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>((done) => server.close(() => done()));
    throw new Error('local render server did not bind a port');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((done) => {
      server.closeAllConnections?.();
      server.close(() => done());
    }),
  };
}

export type ResolvedRenderTarget = {
  readonly url: string;
  close(): Promise<void>;
};

export type ServedProjectEntry = ResolvedRenderTarget & Readonly<{
  bytes: Buffer;
  productionRevisionSha256: string;
  assertSourceCurrent(): void;
}>;

const NO_CLOSE = async (): Promise<void> => {};

/** Serves an immutable snapshot of the production entry directory and its relative assets. */
export async function serveProjectEntry(root: string, entryPath: string, options: { spa?: boolean } = {}): Promise<ServedProjectEntry> {
  const path = safeRelativePath(entryPath, 'production entry');
  const absolute = resolve(root, path);
  const snapshot = materializeProjectTree(root, path);
  const entry = basename(absolute);
  const bytes = snapshot.files.get(entry);
  if (bytes === undefined) throw new Error('production entry is not in the served manifest');
  const served = await serveProjectSnapshot(snapshot, options.spa ? entry : undefined);
  return {
    url: `${served.origin}/${encodeURIComponent(entry)}`,
    bytes: Buffer.from(bytes),
    productionRevisionSha256: snapshot.sha256,
    assertSourceCurrent() {
      const current = materializeProjectTree(root, path);
      const changed = [...new Set([
        ...[...snapshot.identities].filter(([name, value]) => current.identities.get(name) !== value).map(([name]) => name),
        ...[...current.identities.keys()].filter((name) => !snapshot.identities.has(name)),
      ])].sort();
      if (current.sha256 !== snapshot.sha256
        || current.identities.size !== snapshot.identities.size
        || changed.length > 0) {
        const detail = changed.map((name) =>
          `${name}[${snapshot.identities.get(name) ?? 'missing'}=>${current.identities.get(name) ?? 'missing'}]`,
        ).join(', ');
        throw new Error(`served project source changed after snapshot: ${detail || 'byte manifest'}`);
      }
    },
    close: served.close,
  };
}

/**
 * The one resolver every capture path uses. A built application entry is served over loopback; a
 * plain fixture keeps the cheap `file://` path so nothing pays for a server it does not need.
 */
export async function resolveRenderTarget(target: string): Promise<ResolvedRenderTarget> {
  if (/^https?:\/\//.test(target)) return { url: target, close: NO_CLOSE };
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`no such page: ${target}`);
  if (/\.html?$/i.test(path) && requiresHttpOrigin(readFileSync(path, 'utf8'))) {
    const served = await serveDirectory(dirname(path));
    return { url: `${served.origin}/${encodeURIComponent(basename(path))}`, close: served.close };
  }
  return { url: pathToFileURL(path).href, close: NO_CLOSE };
}

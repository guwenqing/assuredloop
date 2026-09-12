import { lstat, readFile, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fail, relativePath } from './files.js';

export const isLinkedRuntime = (runtime) => runtime?.mode === 'linked-development';
export const runtimeContext = (runtime) => isLinkedRuntime(runtime)
  ? { runtime: { mode: 'linked-development', toolkit_verification: 'not-performed' } } : {};

function packageSelections(filename) {
  const segments = filename.split(path.sep);
  const index = segments.lastIndexOf('node_modules');
  if (index < 0 || !segments[index + 1] || segments[index + 1] === '.bin') return [];
  const end = index + (segments[index + 1].startsWith('@') ? 3 : 2);
  if (end > segments.length) return [];
  return [{ root: segments.slice(0, end).join(path.sep), name: segments.slice(index + 1, end).join('/') }];
}

// Preserve each lexical hop: realpath alone loses the package-root relationship
// that distinguishes npm link from an ordinary executable shim.
async function resolveInvocation(filename) {
  const selections = new Map();
  const visited = new Set();
  let current = filename;
  for (let hops = 0; hops < 64; hops++) {
    if (visited.has(current)) fail('runtime-selection-unavailable', 'Executable links contain a cycle.');
    visited.add(current);
    for (const selection of packageSelections(current)) if (!selections.has(selection.root)) selections.set(selection.root, selection);
    const parsed = path.parse(current);
    const segments = current.slice(parsed.root.length).split(path.sep).filter(Boolean);
    let prefix = parsed.root;
    let followed = false;
    for (let index = 0; index < segments.length; index++) {
      prefix = path.join(prefix, segments[index]);
      const stat = await lstat(prefix);
      if (!stat.isSymbolicLink()) continue;
      const selection = selections.get(prefix);
      if (selection) selection.linked = true;
      const target = await readlink(prefix);
      current = path.resolve(path.dirname(prefix), target, ...segments.slice(index + 1));
      followed = true;
      break;
    }
    if (!followed) return { filename: current, selections: [...selections.values()] };
  }
  fail('runtime-selection-unavailable', 'Executable link resolution exceeded its bounded depth.');
}

export async function resolveRuntime({ invokedPath, modulePath } = {}) {
  try {
    if (typeof invokedPath !== 'string' || !path.isAbsolute(invokedPath) ||
        typeof modulePath !== 'string' || !path.isAbsolute(modulePath)) {
      fail('runtime-selection-unavailable', 'Runtime selection requires the actual absolute invocation and module paths.');
    }
    const loaded = await realpath(modulePath);
    const resolved = await resolveInvocation(path.resolve(invokedPath));
    if (resolved.filename !== loaded) fail('runtime-selection-unavailable', 'Invoked executable differs from the loaded module.');
    let root = path.dirname(loaded);
    let pkg;
    while (true) {
      try { pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const parent = path.dirname(root);
      if (parent === root) fail('runtime-selection-unavailable', 'The invoked module has no owning package.');
      root = parent;
    }
    if (!resolved.selections.length) return { mode: 'direct-source' };
    const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin || {});
    if (!bins.length || !bins.some((bin) => path.resolve(root, relativePath(
      typeof bin === 'string' ? bin.replace(/^(\.\/)+/, '') : bin,
    )) === loaded)) {
      fail('runtime-selection-unavailable', 'Invoked module is not a declared package executable.');
    }
    let linked = false;
    for (const selection of resolved.selections) {
      if (selection.name !== pkg.name || await realpath(selection.root) !== root) {
        fail('runtime-selection-unavailable', 'Selected npm package root does not own the invoked executable.');
      }
      linked ||= selection.linked === true;
    }
    return { mode: linked ? 'linked-development' : 'installed' };
  } catch (error) {
    if (error.code === 'runtime-selection-unavailable') throw error;
    fail('runtime-selection-unavailable', `Could not resolve the selected executable: ${error.message}`);
  }
}

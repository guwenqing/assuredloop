import { execFile as callbackExecFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

export const execFile = promisify(callbackExecFile);

export function fail(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

export function relativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) ||
      value.includes('{{') || path.posix.isAbsolute(value) || path.posix.normalize(value) !== value ||
      value.split('/').includes('..') || value.endsWith('/')) {
    fail('path-unsafe', `Expected normalized relative path: ${value}`);
  }
  return value;
}

export async function safePath(root, relative) {
  relativePath(relative);
  const actualRoot = await realpath(root);
  let current = actualRoot;
  for (const segment of relative === '.' ? [] : relative.split('/')) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) fail('path-unsafe', `Symbolic link in managed path: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return current;
}

export async function optionalRead(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function git(root, args, { binary = false } = {}) {
  try {
    const { stdout } = await execFile('git', ['-C', root, ...args], {
      encoding: binary ? 'buffer' : 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    return binary ? stdout : stdout.trim();
  } catch (error) {
    if (error.code === 'ENOENT') fail('tool-unavailable', 'Git is unavailable: missing-binary');
    fail('binding-invalid', `Git could not resolve the selected repository/revision: ${error.stderr || error.message}`);
  }
}

export async function repositoryRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) fail('binding-invalid', 'An explicit absolute target root is required.');
  let actual;
  try { actual = await realpath(root); }
  catch { fail('binding-invalid', `Target root is unavailable: ${root}`); }
  const top = await git(actual, ['rev-parse', '--show-toplevel']);
  if (await realpath(top) !== actual) fail('binding-invalid', 'The target must be the repository root, not a nested directory.');
  return actual;
}

export function repositoryIdentity(origin) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?$/i.exec(origin);
  if (!match) fail('binding-invalid', 'Unsupported repository origin format; use an explicit supported GitHub binding.');
  return match[1].toLowerCase();
}

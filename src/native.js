import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile, fail, optionalRead, relativePath, safePath } from './files.js';

const require = createRequire(import.meta.url);

export async function nativeTools() {
  try {
    const entry = require.resolve('@fission-ai/openspec');
    const root = path.resolve(path.dirname(entry), '..');
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    if (pkg.version !== '1.12.0') fail('compatibility-error', `Unsupported OpenSpec registry version: ${pkg.version}`);
    const { AI_TOOLS } = await import(pathToFileURL(path.join(root, 'dist/core/config.js')).href);
    if (!Array.isArray(AI_TOOLS) || !AI_TOOLS.length || AI_TOOLS.some((tool) =>
      typeof tool.value !== 'string' || typeof tool.available !== 'boolean' ||
      (tool.skillsDir !== undefined && typeof tool.skillsDir !== 'string'))) {
      fail('compatibility-error', 'Unsupported OpenSpec tool registry shape.');
    }
    for (const tool of AI_TOOLS) if (tool.skillsDir) relativePath(tool.skillsDir);
    return AI_TOOLS;
  } catch (error) {
    if (error.code === 'compatibility-error') throw error;
    fail('compatibility-error', `Pinned OpenSpec registry unavailable: ${error.message}`);
  }
}

export async function skillRoots(targetRoot, selected) {
  const registry = await nativeTools();
  const roots = new Map();
  for (const id of selected) {
    const tool = registry.find((entry) => entry.value === id);
    if (!tool?.available || !tool.skillsDir) fail('compatibility-error', `Tool has no supported local Skill root: ${id}`);
    const group = roots.get(tool.skillsDir) ?? [];
    group.push(id);
    roots.set(tool.skillsDir, group);
  }
  for (const [root, ids] of roots) {
    const markerPath = await safePath(targetRoot, `${root}/skills/.openspec-target`);
    const marker = await optionalRead(markerPath);
    if (marker !== null && !ids.includes(marker.trim())) {
      fail('compatibility-error', `Shared Skill root ${root} belongs to ${marker.trim() || 'an unresolved owner'}; selected tools: ${ids.join(', ')}.`);
    }
  }
  return [...roots.keys()];
}

export async function githubPreflight(repository, labels, localOnly) {
  if (localOnly) return [{ code: 'github-skipped', message: 'Local-only initialization: GitHub access, labels and live acceptance were not checked.' }];
  let version;
  try { version = (await execFile('gh', ['--version'])).stdout; }
  catch (error) { fail('tool-unavailable', 'GitHub CLI unavailable.', { reason: error.code === 'ENOENT' ? 'missing-binary' : 'transport-error' }); }
  const match = /gh version (\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match || Number(match[1]) < 2 || (Number(match[1]) === 2 && Number(match[2]) < 88)) {
    fail('tool-unavailable', 'gh >=2.88.0 is required.', { reason: 'unsupported-version' });
  }
  try {
    await execFile('gh', ['auth', 'status', '--hostname', 'github.com']);
  } catch { fail('tool-unavailable', 'GitHub authentication is required; initialize credentials explicitly.', { reason: 'authentication-required' }); }
  async function api(endpoint, extra = []) {
    try { return (await execFile('gh', ['api', endpoint, '--hostname', 'github.com', ...extra], { maxBuffer: 4 * 1024 * 1024 })).stdout; }
    catch (error) {
      const message = String(error.stderr || error.message);
      const reason = /rate.limit|HTTP 429/i.test(message) ? 'rate-limited' : /HTTP (403|404)/.test(message) ? 'insufficient-access' : 'transport-error';
      const details = { reason };
      if (reason === 'rate-limited') {
        const retryAfter = /Retry-After:\s*(\d+)/i.exec(message);
        const reset = /X-RateLimit-Reset:\s*(\d+)/i.exec(message);
        if (retryAfter) details.retry_after_seconds = Number(retryAfter[1]);
        if (reset && Number(reset[1]) <= 8640000000000) details.retry_at = new Date(Number(reset[1]) * 1000).toISOString();
      }
      fail('tool-unavailable', 'Could not inspect the explicitly bound GitHub repository.', details);
    }
  }
  const remote = JSON.parse(await api(`repos/${repository}`));
  if (remote.full_name.toLowerCase() !== repository.toLowerCase()) fail('binding-invalid', 'Repository redirect/rename requires an explicit binding update.');
  const pages = JSON.parse(await api(`repos/${repository}/labels?per_page=100`, ['--paginate', '--slurp']));
  const existing = new Set(pages.flat().map((label) => label.name.toLowerCase()));
  const missing = Object.values(labels.type).filter((label) => !existing.has(label.toLowerCase()));
  return missing.length ? [{ code: 'labels-missing', labels: missing, message: 'Adopting owner must provision or map these labels before routed work.' }] : [];
}

import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

export async function reviewRouting(config) {
  const routing = config.project.review.routing;
  if (!routing) return { status: 'not-configured', findings: [{ code: 'review-routing-not-configured', severity: 'review' }] };
  const result = { ...routing, status: 'available', supported_tools: [], findings: [] };
  try {
    result.supported_tools = (await nativeTools()).filter((tool) => tool.available).map((tool) => tool.value);
  } catch (error) {
    return { ...result, status: 'unavailable', findings: [{ code: 'review-tool-registry-unavailable', severity: 'unavailable', message: error.message }] };
  }
  if (!config.repository.tools.includes(routing.primary_tool)) result.findings.push({ code: 'review-primary-tool-unselected',
    message: 'The primary review tool must be selected in repository.tools.' });
  if (!result.supported_tools.includes(routing.primary_tool)) result.findings.push({ code: 'review-tool-unsupported',
    message: `Unsupported primary native review tool: ${routing.primary_tool}` });
  if (result.findings.length) result.status = 'invalid';
  return result;
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

export async function githubAuthentication() {
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
}

async function githubApi(endpoint, extra = []) {
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

export async function githubLabelInventory(repository, { requireWrite = false } = {}) {
  await githubAuthentication();
  const remote = JSON.parse(await githubApi(`repos/${repository}`));
  if (typeof remote.full_name !== 'string' || remote.full_name.toLowerCase() !== repository.toLowerCase()) fail('binding-invalid', 'Repository redirect/rename requires an explicit binding update.');
  if (requireWrite && remote.permissions?.push === false && !remote.permissions.admin && !remote.permissions.maintain) {
    fail('tool-unavailable', 'Repository write access is required to create labels.', { reason: 'insufficient-access' });
  }
  const pages = JSON.parse(await githubApi(`repos/${repository}/labels?per_page=100`, ['--paginate', '--slurp']));
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)) || pages.flat().some((label) => typeof label?.name !== 'string')) {
    fail('tool-unavailable', 'GitHub returned an unsupported label inventory.', { reason: 'invalid-response' });
  }
  return { repository: remote.full_name, labels: pages.flat() };
}

export async function createGithubLabel(repository, operation) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'assuredloop-label-'));
  try {
    const input = path.join(temporary, 'request.json');
    await writeFile(input, JSON.stringify(operation), { mode: 0o600 });
    await githubApi(`repos/${repository}/labels`, ['--method', 'POST', '--input', input]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function githubPreflight(repository, labels, localOnly) {
  if (localOnly) return [{ code: 'github-skipped', message: 'Local-only initialization: GitHub access, labels and live acceptance were not checked.' }];
  const inventory = await githubLabelInventory(repository);
  const existing = new Set(inventory.labels.map((label) => label.name.toLowerCase()));
  const missing = Object.values(labels.type).filter((label) => !existing.has(label.toLowerCase()));
  return missing.length ? [{ code: 'labels-missing', labels: missing, message: 'Adopting owner must provision or map these labels before routed work.' }] : [];
}

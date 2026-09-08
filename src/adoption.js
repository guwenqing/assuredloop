import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { fail, git, optionalRead, relativePath, repositoryIdentity, repositoryRoot, safePath } from './files.js';
import { validateRecord } from './records.js';
import { verifyContracts } from './contracts.js';
import { githubPreflight, skillRoots } from './native.js';

const installedRoot = fileURLToPath(new URL('..', import.meta.url));
const plans = new WeakMap();

function render(content, bindings) {
  const result = content.replace(/\{\{([a-z_]+)\}\}/g, (original, key) => bindings[key] ?? original);
  let inTemplate = false;
  for (const line of result.split('\n')) {
    const marker = line.trim();
    if (marker === '<!-- assuredloop:template:start -->') {
      if (inTemplate) fail('binding-invalid', 'Reusable template regions cannot be nested.');
      inTemplate = true;
    } else if (marker === '<!-- assuredloop:template:end -->') {
      if (!inTemplate) fail('binding-invalid', 'Reusable template end has no matching start.');
      inTemplate = false;
    } else if (!inTemplate && line.includes('{{')) {
      fail('binding-invalid', 'Required template bindings remain unresolved outside a declared reusable example.');
    }
  }
  if (inTemplate) fail('binding-invalid', 'Reusable template region has no matching end.');
  return result;
}

async function validateTarget(targetRoot, config) {
  const actualRoot = await repositoryRoot(targetRoot);
  const origin = await git(actualRoot, ['remote', 'get-url', 'origin']);
  if (repositoryIdentity(origin) !== config.repository.name.toLowerCase()) {
    fail('binding-invalid', 'Explicit repository binding does not match the target origin.');
  }
  const contextPath = await safePath(actualRoot, `${config.repository.openspec_root}/config.yaml`.replace(/^\.\//, ''));
  if (await optionalRead(contextPath) === null) fail('binding-invalid', 'Native OpenSpec context is missing. Run its explicit initialization first.');
  return actualRoot;
}

async function checkFile(targetRoot, file) {
  const destination = await safePath(targetRoot, file.path);
  const existing = await optionalRead(destination);
  if (existing !== null && existing !== file.content) fail('file-conflict', `Existing file differs: ${file.path}`);
  return existing === null ? 'create' : 'unchanged';
}

export async function planInitialization({ targetRoot, config, packageRoot = installedRoot, localOnly = false } = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 19)) fail('tool-unavailable', 'Node.js >=20.19.0 is required.', { reason: 'unsupported-version' });
  if (config?.repository?.openspec_root !== undefined) relativePath(config.repository.openspec_root);
  const validation = validateRecord('config', config);
  if (!validation.valid) fail('binding-invalid', 'Explicit target configuration is missing or invalid.', validation.errors);
  if (JSON.stringify(config).includes('{{')) fail('binding-invalid', 'Unresolved placeholder in target configuration.');
  const actualRoot = await validateTarget(targetRoot, config);
  const metadata = await verifyContracts(packageRoot);
  const packageJson = JSON.parse(await readFile(await safePath(packageRoot, 'package.json'), 'utf8'));
  const binding = config.project.workflow;
  if (binding.name !== metadata.name || binding.version !== metadata.version ||
      packageJson.name !== binding.name || packageJson.version !== binding.version ||
      binding.contracts_path !== metadata.contracts_path || !isDeepStrictEqual(binding.source_ref, metadata.source_ref)) {
    fail('version-mismatch', 'Selected installation and target contract pin differ. Select an explicitly compatible package.');
  }
  const roots = await skillRoots(actualRoot, config.repository.tools);
  const diagnostics = await githubPreflight(config.repository.name, config.repository.labels, localOnly);
  diagnostics.push({ code: 'not-active', message: 'Initialization is not policy acceptance or activation; package integrity is a supplied binding, not publisher authentication.' });
  const files = [{ path: '.assuredloop/config.json', content: `${JSON.stringify(config, null, 2)}\n` }];
  const bindings = { repository: config.repository.name, openspec_root: config.repository.openspec_root,
    package_name: binding.name, package_version: binding.version };
  const sources = await readdir(await safePath(packageRoot, 'skills'), { withFileTypes: true });
  for (const source of sources) {
    if (!source.isDirectory() || !/^assuredloop-[a-z0-9-]+$/.test(source.name)) fail('compatibility-error', `Unsupported packaged Skill asset: ${source.name}`);
    const sourceFile = await safePath(packageRoot, `skills/${source.name}/SKILL.md`);
    const content = render(await readFile(sourceFile, 'utf8'), bindings);
    for (const root of roots) files.push({ path: `${root}/skills/${source.name}/SKILL.md`, content });
  }
  if (!sources.length) fail('compatibility-error', 'No reusable Skill assets are installed.');
  for (const file of files) file.action = await checkFile(actualRoot, file);
  const plan = { status: 'preview', targetRoot: path.resolve(targetRoot), files, diagnostics };
  plans.set(plan, { root: actualRoot, snapshot: structuredClone(plan), config: structuredClone(config) });
  return plan;
}

export async function applyInitialization(plan) {
  const saved = plans.get(plan);
  if (!saved || !isDeepStrictEqual(saved.snapshot, plan)) fail('binding-invalid', 'Apply requires an unchanged plan returned by this initialization process.');
  if (await validateTarget(plan.targetRoot, saved.config) !== saved.root) fail('binding-invalid', 'Target changed after preview.');
  await skillRoots(saved.root, saved.config.repository.tools);
  for (const file of plan.files) {
    if (await checkFile(saved.root, file) !== file.action) fail('file-conflict', `Target changed after preview: ${file.path}`);
  }
  for (const file of plan.files.filter((entry) => entry.action === 'create')) {
    const destination = await safePath(saved.root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await safePath(saved.root, file.path);
    await writeFile(destination, file.content, { flag: 'wx' });
  }
  plans.delete(plan);
  return { ...plan, status: 'applied' };
}

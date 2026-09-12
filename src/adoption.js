import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { fail, git, optionalRead, relativePath, repositoryIdentity, repositoryRoot, safePath } from './files.js';
import { validateRecord } from './records.js';
import { verifyContracts } from './contracts.js';
import { isLinkedRuntime, runtimeContext } from './runtime.js';
import { createGithubLabel, githubLabelInventory, githubPreflight, skillRoots, reviewRouting } from './native.js';

const installedRoot = fileURLToPath(new URL('..', import.meta.url));
const plans = new WeakMap();

function render(content, bindings) {
  const parts = content.split(/(\r\n|\n|\r)/);
  const result = [];
  let inTemplate = false;
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index];
    const marker = line.trim();
    if (marker === '<!-- assuredloop:template:start -->') {
      if (inTemplate) fail('binding-invalid', 'Reusable template regions cannot be nested.');
      inTemplate = true;
    } else if (marker === '<!-- assuredloop:template:end -->') {
      if (!inTemplate) fail('binding-invalid', 'Reusable template end has no matching start.');
      inTemplate = false;
    }
    const unresolved = line.replace(/\{\{([a-z_]+)\}\}/g, (original, key) => Object.hasOwn(bindings, key) ? '' : original);
    if (!inTemplate && unresolved.includes('{{')) {
      fail('binding-invalid', 'Required template bindings remain unresolved outside a declared reusable example.');
    }
    const rendered = line.replace(/\{\{([a-z_]+)\}\}/g, (original, key) => Object.hasOwn(bindings, key) ? bindings[key] : original);
    result.push(rendered, parts[index + 1] ?? '');
  }
  if (inTemplate) fail('binding-invalid', 'Reusable template region has no matching end.');
  return result.join('');
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

async function selectedAssets(packageRoot) {
  const root = await realpath(packageRoot);
  const packageJson = await readFile(await safePath(root, 'package.json'), 'utf8');
  const sources = await readdir(await safePath(root, 'skills'), { withFileTypes: true });
  const skills = [];
  for (const source of sources) {
    if (!source.isDirectory() || !/^assuredloop-[a-z0-9-]+$/.test(source.name)) fail('compatibility-error', `Unsupported packaged Skill asset: ${source.name}`);
    skills.push({ name: source.name, content: await readFile(await safePath(root, `skills/${source.name}/SKILL.md`), 'utf8') });
  }
  if (!skills.length) fail('compatibility-error', 'No reusable Skill assets are installed.');
  return { root, packageJson, skills };
}

export async function planInitialization({ targetRoot, config, packageRoot = installedRoot, localOnly = false, provisionLabels = false, runtime } = {}) {
  if (localOnly && provisionLabels) fail('binding-invalid', 'Label provisioning requires live GitHub access and cannot be combined with local-only initialization.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 19)) fail('tool-unavailable', 'Node.js >=20.19.0 is required.', { reason: 'unsupported-version' });
  if (config?.repository?.openspec_root !== undefined) relativePath(config.repository.openspec_root);
  const validation = validateRecord('config', config);
  if (!validation.valid) fail('binding-invalid', 'Explicit target configuration is missing or invalid.', validation.errors);
  if (JSON.stringify(config).includes('{{')) fail('binding-invalid', 'Unresolved placeholder in target configuration.');
  const routing = await reviewRouting(config);
  if (['invalid', 'unavailable'].includes(routing.status)) fail('binding-invalid', routing.findings.map((item) => item.message).join(' '), routing.findings);
  const actualRoot = await validateTarget(targetRoot, config);
  const binding = config.project.workflow;
  if (!isLinkedRuntime(runtime)) {
    const metadata = await verifyContracts(packageRoot);
    const packageJson = JSON.parse(await readFile(await safePath(packageRoot, 'package.json'), 'utf8'));
    if (binding.name !== metadata.name || binding.version !== metadata.version ||
        packageJson.name !== binding.name || packageJson.version !== binding.version ||
        binding.contracts_path !== metadata.contracts_path || !isDeepStrictEqual(binding.source_ref, metadata.source_ref)) {
      fail('version-mismatch', 'Selected installation and target contract pin differ. Select an explicitly compatible package.');
    }
  }
  const roots = await skillRoots(actualRoot, config.repository.tools);
  const diagnostics = await githubPreflight(config.repository.name, config.repository.labels, localOnly);
  diagnostics.push(...routing.findings);
  diagnostics.push({ code: 'not-active', message: 'Initialization is not policy acceptance or activation; package integrity is a supplied binding, not publisher authentication.' });
  const files = [{ path: '.assuredloop/config.json', content: `${JSON.stringify(config, null, 2)}\n` }];
  const bindings = { repository: config.repository.name, openspec_root: config.repository.openspec_root,
    package_name: binding.name, package_version: binding.version };
  const assets = await selectedAssets(packageRoot);
  for (const source of assets.skills) {
    const content = render(source.content, bindings);
    for (const root of roots) files.push({ path: `${root}/skills/${source.name}/SKILL.md`, content });
  }
  for (const file of files) file.action = await checkFile(actualRoot, file);
  const plan = { ...runtimeContext(runtime), status: 'preview', targetRoot: path.resolve(targetRoot), files, diagnostics };
  if (provisionLabels) {
    const missing = diagnostics.find((entry) => entry.code === 'labels-missing')?.labels ?? [];
    plan.label_provisioning = {
      repository: config.repository.name,
      config_digest: createHash('sha256').update(files[0].content).digest('hex'),
      operations: missing.map((name) => ({ name, color: 'ededed', description: 'AssuredLoop workflow label.' })),
    };
  }
  plans.set(plan, { root: actualRoot, snapshot: structuredClone(plan), config: structuredClone(config),
    packageRoot: path.resolve(packageRoot), assets });
  return plan;
}

async function revalidate(plan, saved) {
  if (await validateTarget(plan.targetRoot, saved.config) !== saved.root) fail('binding-invalid', 'Target changed after preview.');
  await skillRoots(saved.root, saved.config.repository.tools);
  if (plan.label_provisioning && !isDeepStrictEqual(await selectedAssets(saved.packageRoot), saved.assets)) {
    fail('binding-invalid', 'Selected package or Skill assets changed after preview; create a new preview.');
  }
  for (const file of plan.files) {
    if (await checkFile(saved.root, file) !== file.action) fail('file-conflict', `Target changed after preview: ${file.path}`);
  }
}

function errorDetails(error) {
  return { code: error.code || 'operation-failed', message: error.message, ...(error.details ? { details: error.details } : {}) };
}

export async function applyInitialization(plan) {
  const saved = plans.get(plan);
  if (!saved || !isDeepStrictEqual(saved.snapshot, plan)) fail('binding-invalid', 'Apply requires an unchanged plan returned by this initialization process.');
  const originalPlan = plan;
  // An attempted provisioning apply is single-use, including partial outcomes.
  if (plan.label_provisioning) plans.delete(plan);
  // Keep awaited remote operations bound to the preview even if the caller changes its object.
  plan = structuredClone(saved.snapshot);
  await revalidate(plan, saved);
  const effects = [], written = [];
  let remaining = plan.label_provisioning?.operations ?? [];
  const result = (status, error) => ({ ...plan, status,
    ...(plan.label_provisioning ? { label_provisioning: { ...plan.label_provisioning, effects, remaining } } : {}),
    ...(error ? { error: errorDetails(error), files_created: written,
      files_remaining: plan.files.filter((file) => file.action === 'create' && !written.includes(file.path)).map((file) => file.path) } : {}),
  });
  if (plan.label_provisioning) {
    const repository = plan.label_provisioning.repository;
    let inventory = await githubLabelInventory(repository, { requireWrite: true });
    for (const operation of plan.label_provisioning.operations) {
      try {
        await revalidate(plan, saved);
        if (!inventory.labels.some((label) => label.name.toLowerCase() === operation.name.toLowerCase())) {
          let creationError;
          try { await createGithubLabel(repository, operation); } catch (error) { creationError = error; }
          try { inventory = await githubLabelInventory(repository, { requireWrite: true }); }
          catch (error) {
            effects.push({ name: operation.name, status: 'unverified', ...(creationError ? { creation_error: errorDetails(creationError) } : {}), error: errorDetails(error) });
            return result('partial', error);
          }
          if (!inventory.labels.some((label) => label.name.toLowerCase() === operation.name.toLowerCase())) {
            const error = creationError ?? Object.assign(new Error('Created label was not confirmed by readback.'), { code: 'effect-unverified' });
            effects.push({ name: operation.name, status: creationError ? 'failed' : 'unverified', error: errorDetails(error) });
            return result('partial', error);
          }
          effects.push({ name: operation.name, status: creationError ? 'skipped' : 'created', ...(creationError ? { creation_error: errorDetails(creationError) } : {}) });
        } else effects.push({ name: operation.name, status: 'skipped' });
        remaining = remaining.slice(1);
      } catch (error) {
        if (!effects.length) throw error;
        return result('partial', error);
      }
    }
  }
  try {
    await revalidate(plan, saved);
    for (const file of plan.files.filter((entry) => entry.action === 'create')) {
      const destination = await safePath(saved.root, file.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await safePath(saved.root, file.path);
      await writeFile(destination, file.content, { flag: 'wx' });
      written.push(file.path);
    }
  } catch (error) {
    if (!plan.label_provisioning) throw error;
    return result('partial', error);
  }
  plans.delete(originalPlan);
  return result('applied');
}

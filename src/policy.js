import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { fail, safePath } from './files.js';
import { validateRecord } from './records.js';
import { verifyContracts } from './contracts.js';
import { workIdentity } from './read-adapter.js';
import { loadNativeRuntime } from './native-runtime.js';

const installedRoot = fileURLToPath(new URL('..', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

function requireShape(kind, value, field) {
  const checked = validateRecord(kind, value);
  if (!checked.valid) {
    const fields = checked.errors.map((error) => [field, ...String(error.instancePath || '').split('/').filter(Boolean), error.params?.missingProperty].filter(Boolean).join('.'));
    fail('policy-unavailable', `Invalid or missing ${fields.join(', ')}.`, checked.errors);
  }
}

export async function checkAnchor(ref, text) {
  if (!ref.anchor) return;
  const { MarkdownParser } = await loadNativeRuntime();
  const sections = new MarkdownParser(text).parseSections();
  const seen = new Set();
  let found = false;
  function visit(items) {
    for (const section of items) {
      const title = section.title.replace(/\s+#+\s*$/, '').trim()
        .replace(/!?\[([^\]]*)\]\((?:\\.|[^)])*\)/g, '$1')
        .replace(/(^|[^\p{L}\p{N}])(_{1,2})(\S(?:.*?\S)?)\2(?=$|[^\p{L}\p{N}])/gu, '$1$3');
      const base = title.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
      let slug = base;
      let index = 0;
      while (seen.has(slug)) slug = `${base}-${++index}`;
      seen.add(slug);
      if (slug === ref.anchor) found = true;
      visit(section.children || []);
    }
  }
  visit(sections);
  if (!found) fail('record-unavailable', `Heading anchor is unavailable: ${ref.anchor}`);
}

export async function resolvePolicy({ adapter, work, packageRoot = installedRoot } = {}) {
  return resolvePolicySnapshot({ adapter, work, packageRoot });
}

async function resolvePolicySnapshot({ adapter, work, packageRoot, historicalPull, currentContext }) {
  const result = { status: 'unavailable', mode: null, config: null, activation: null, policy_ref: null,
    contract_package: null, config_digest: null, activation_digest: null, sources: [], findings: [] };
  let field = 'destination';
  try {
    const identity = currentContext ? { repository: currentContext.repository } : workIdentity(work);
    const pull = currentContext ? null : historicalPull || await adapter.readPull(work);
    if (!currentContext && (pull?.number !== identity.number || pull?.base?.repo?.full_name?.toLowerCase() !== identity.repository ||
        !validateRecord('sha', pull?.base?.sha).valid || !validateRecord('sha', pull?.head?.sha).valid ||
        typeof pull?.base?.ref !== 'string' || !pull.base.ref)) fail('binding-invalid', 'Actual PR destination metadata is missing or inconsistent.');
    if (pull) result.assessment = { pr: work, head: pull.head.sha, base_ref: pull.base.ref, base_sha: pull.base.sha };
    const refAtBase = (path) => ({ repository: identity.repository, revision: currentContext?.revision || pull.base.sha, path });
    let allowed = new Set([identity.repository]);
    let metadata;

    async function source(ref, role, optional = false) {
      field = role;
      requireShape('evidenceRef', ref, role);
      let bytes;
      let descriptor;
      let installedAsset = false;
      if (Object.hasOwn(ref, 'comment_id')) {
        if (!allowed.has(ref.repository.toLowerCase())) fail('reference-out-of-scope', 'Acceptance source is outside permitted repositories.');
        const comment = await adapter.readComment(ref);
        if (comment?.id !== ref.comment_id || typeof comment?.body !== 'string') fail('record-unavailable', 'Comment identity/body representation is unavailable.');
        bytes = Buffer.from(comment.body, 'utf8');
        descriptor = { kind: 'github-issue-comment', repository: ref.repository, comment_id: ref.comment_id,
          endpoint: 'GET /repos/{owner}/{repo}/issues/comments/{id}', api_version: '2022-11-28',
          media_type: 'application/vnd.github.raw+json', field: 'body', encoding: 'utf-8', normalization: 'none' };
      } else {
        const prefix = metadata?.source_ref.path === '.' ? '' : `${metadata?.source_ref.path}/`;
        const asset = metadata && ref.repository.toLowerCase() === metadata.source_ref.repository.toLowerCase() && ref.revision === metadata.source_ref.revision &&
          metadata.files.find((item) => ref.path === `${prefix}${item.path}`);
        if (asset) {
          bytes = await readFile(await safePath(packageRoot, `${metadata.contracts_path}/${asset.path}`));
          installedAsset = true;
        }
        else {
          if (!allowed.has(ref.repository.toLowerCase())) fail('reference-out-of-scope', 'Policy source is outside permitted repositories.');
          try { bytes = await adapter.readBlob(ref); }
          catch (error) { if (optional && error.code === 'record-unavailable' && error.details?.reason === 'path-missing') return null; throw error; }
        }
        descriptor = { kind: 'git-blob', representation: 'raw-bytes', ref: structuredClone(ref) };
      }
      const content = decode(bytes);
      result.sources.push({ role, source: descriptor, content, content_sha256: digest(bytes), ...(installedAsset ? { acquisition: 'installed-contract' } : {}) });
      await checkAnchor(ref, content);
      return { bytes, content };
    }

    const configSource = await source(refAtBase('.assuredloop/config.json'), 'config');
    result.config_digest = digest(configSource.bytes);
    result.config = JSON.parse(configSource.content);
    field = 'config';
    requireShape('config', result.config, 'config');
    if (result.config.repository.name.toLowerCase() !== identity.repository) fail('binding-invalid', 'Destination config repository differs from actual PR identity.');
    allowed = new Set([identity.repository, ...(result.config.repository.allowed_reference_repositories || []).map((name) => name.toLowerCase())]);
    field = 'project.workflow package binding';
    metadata = await verifyContracts(packageRoot);
    const pkg = JSON.parse(await readFile(await safePath(packageRoot, 'package.json'), 'utf8'));
    const binding = result.config.project.workflow;
    if (binding.name !== pkg.name || binding.version !== pkg.version || binding.name !== metadata.name ||
        binding.version !== metadata.version || binding.contracts_path !== metadata.contracts_path ||
        !isDeepStrictEqual(binding.source_ref, metadata.source_ref)) fail('policy-unavailable', 'Selected package and destination project.workflow binding differ.');
    result.contract_package = structuredClone(binding);

    const activationSource = await source(refAtBase('.assuredloop/activation.json'), 'activation', true);
    if (activationSource) {
      result.activation_digest = digest(activationSource.bytes);
      result.activation = JSON.parse(activationSource.content);
      field = 'activation';
      requireShape('activation', result.activation, 'activation');
      if (result.activation.state !== 'active') fail('policy-unavailable', 'Activation is suspended; bootstrap fallback is forbidden.');
      if (!isDeepStrictEqual(result.activation.contract_package, binding)) fail('policy-unavailable', 'Activation package binding differs from destination project.workflow.');
      result.policy_ref = structuredClone(result.activation.policy_ref);
      await source(result.policy_ref, 'activation.policy_ref');
      for (const ref of result.activation.evidence) await source(ref, 'activation.evidence');
      result.mode = 'activation';
    } else {
      field = 'project.bootstrap';
      const bootstrap = result.config.project.bootstrap;
      requireShape('bootstrap', bootstrap, field);
      result.policy_ref = structuredClone(bootstrap.policy_ref);
      await source(result.policy_ref, 'project.bootstrap.policy_ref');
      await source(bootstrap.policy_acceptance, 'project.bootstrap.policy_acceptance');
      await source(bootstrap.proposal_acceptance, 'project.bootstrap.proposal_acceptance');
      result.mode = 'bootstrap';
    }
    result.status = 'available';
    result.findings.push({ code: 'semantic-authorization-review-required', message: 'Source presence and declarations do not prove owner authority, fixed-policy adoption or independent review.' });
    if (result.mode === 'bootstrap') result.findings.push({ code: 'not-active', message: 'Selected destination bootstrap policy; no activation is claimed.' });
    result.findings.push({ code: 'package-integrity-declaration', message: 'SRI is a declared package binding, not authenticated publisher identity.' });
  } catch (error) {
    result.status = 'unavailable'; result.mode = null;
    result.findings.push({ code: 'policy-unavailable', message: `${field}: ${error.message}`, cause: error.code || 'invalid-source', details: error.details });
  }
  return result;
}

export async function resolveCurrentPolicy({ adapter, repository, packageRoot = installedRoot, prepareSnapshot } = {}) {
  let current;
  try {
    const info = await adapter.readRepository(repository);
    if (typeof info.default_branch !== 'string' || !info.default_branch) fail('policy-unavailable', 'Repository metadata has no current default branch.');
    const branch = info.default_branch;
    const revision = await adapter.readBranchHead({ repository, branch });
    current = { repository, branch, revision, fetched_at: new Date().toISOString(), comparison: 'current-policy-only' };
    if (prepareSnapshot) adapter = await prepareSnapshot({ repository, revision });
    const result = await resolvePolicySnapshot({ adapter, packageRoot, currentContext: current });
    result.current = current;
    const fresh = await adapter.readRepository(repository);
    const observed = await adapter.readBranchHead({ repository, branch });
    if (fresh.default_branch !== branch || observed !== revision) {
      result.status = 'invalid';
      result.findings.push({ code: 'current-context-stale', message: 'The remote default branch or its revision changed during current-context inspection.' });
    }
    result.findings.push({ code: 'current-policy-comparison', message: 'Default-branch context is current only; past authorization needs independent evidence. Historical audit fields are unchanged.' });
    return result;
  } catch (error) {
    return { status: 'unavailable', current, sources: [], findings: [{ code: error.code || 'current-policy-unavailable', message: error.message, details: error.details }] };
  }
}

export async function resolveHistoricalPolicy({ adapter, record, packageRoot = installedRoot } = {}) {
  const context = { historical: true, pr: record?.pr, base_sha: record?.base_sha, live_authority: false };
  const reject = (status, code, message) => ({ status, context, findings: [{ code, message }] });
  const shape = validateRecord('evidence', record);
  if (!shape.valid || !record.pr) return reject('invalid', 'historical-evidence-invalid', 'Historical policy requires a valid PR-scoped Evidence record.');
  let pull;
  try { pull = await adapter.readPull(record.pr); }
  catch (error) { return reject('unavailable', error.code || 'historical-pr-unavailable', error.message); }
  const identity = workIdentity(record.pr);
  if (pull?.number !== identity.number || pull?.base?.repo?.full_name?.toLowerCase() !== identity.repository) {
    return reject('invalid', 'historical-pr-identity-invalid', 'Actual PR identity differs from the recorded work.');
  }
  if (pull.merged !== true || typeof pull.merged_at !== 'string' || !Number.isFinite(Date.parse(pull.merged_at)) ||
      !validateRecord('sha', pull.merge_commit_sha).valid) {
    return reject('invalid', 'historical-delivery-unavailable', 'The actual PR has no confirmed merged delivery and resulting commit.');
  }
  if (pull.head?.sha !== record.head || pull.base.ref !== record.base_ref) {
    return reject('invalid', 'historical-tuple-mismatch', 'Recorded head or destination base ref differs from the actual merged PR.');
  }
  const historicalPull = { ...pull, base: { ...pull.base, sha: record.base_sha } };
  const result = await resolvePolicySnapshot({ adapter, work: record.pr, packageRoot, historicalPull });
  result.context = { ...context, merge_commit_sha: pull.merge_commit_sha };
  const reconstructed = result.status === 'available';
  if (reconstructed) {
    for (const [field, actual] of Object.entries({ policy_ref: result.policy_ref, contract_package: result.contract_package,
      config_digest: result.config_digest, activation_digest: result.activation_digest, policy_mode: result.mode })) {
      if (!isDeepStrictEqual(record[field], actual)) {
        result.status = 'invalid';
        result.findings.push({ code: 'historical-policy-mismatch', message: `Recorded ${field} differs from the reconstructed historical policy.` });
      }
    }
  } else {
    for (const field of ['config_digest', 'activation_digest']) {
      if (result[field] !== null && result[field] !== record[field]) {
        result.status = 'invalid';
        result.findings.push({ code: 'historical-policy-mismatch', message: `Recorded ${field} differs from the acquired historical source bytes, independently of policy reconstruction.` });
      }
    }
  }
  result.findings.push({ code: 'historical-assessment-only', message: reconstructed
    ? 'Reconstructed recorded pre-merge policy for a merged PR. This is not current merge authority, authenticated review or proof of the full assigned outcome.'
    : 'Historical pre-merge policy could not be reconstructed by this runtime. Acquired sources and the recorded assessment are retained; unsupported configuration or package binding does not revoke historical acceptance or supply verified delivery.' });
  return result;
}

export function checkReviewEvidence({ record, policy, current = {}, reviewKind } = {}) {
  const findings = [];
  const add = (code, message) => findings.push({ code, message });
  const shape = validateRecord('evidence', record);
  if (!shape.valid) findings.push({ code: 'review-evidence-invalid', message: 'Review evidence shape is invalid.', details: shape.errors });
  if (!record || typeof record !== 'object') return findings;
  return [...findings, ...checkReviewerEligibility({ record, policy, reviewKind }),
    ...checkEvidenceContext({ record, policy, current, code: 'review-evidence-stale' })];
}

export function checkReviewerEligibility({ record, policy, reviewKind } = {}) {
  const findings = [];
  const add = (code, message) => findings.push({ code, message });
  const knownKind = ['internal', 'external'].includes(reviewKind);
  findings.push({ code: knownKind ? 'review-kind-declared' : 'review-kind-unresolved', severity: 'review',
    review_kind: knownKind ? reviewKind : null,
    message: knownKind
      ? `Caller-selected ${reviewKind} comparison only. Source assessment must establish the role; external comparison does not satisfy an internal review obligation.`
      : 'Review role is unresolved. Shared constraints are checked, but this record is not automatically credited to an internal or external review obligation.' });
  if (!record.producer_session || !record.reviewer_session || record.producer_session === record.reviewer_session) {
    add('review-independence-invalid', 'Nonempty different producer/reviewer session declarations are required.');
  }
  if (record.review_depth !== 'full-scope') add('review-depth-invalid', 'Review depth must declare full-scope.');
  const review = policy?.config?.project?.review;
  if (policy?.status !== 'available' || !validateRecord('review', review).valid) {
    add('review-policy-unavailable', 'Accepted destination review policy is unavailable.');
    return findings;
  }
  const aliases = review.model_aliases || {};
  const exclusions = new Set(review.excluded_models);
  let model = record.reviewer_model;
  const seen = new Set();
  while (typeof model === 'string' && Object.hasOwn(aliases, model)) {
    if (seen.has(model)) { add('review-model-unresolved', 'Reviewer model alias cycle.'); model = null; break; }
    seen.add(model);
    if (exclusions.has(model)) add('review-model-excluded', `Excluded reviewer alias: ${model}`);
    model = aliases[model];
  }
  if (typeof model !== 'string' || !model.trim()) add('review-model-unresolved', 'Reviewer model identity is unresolved.');
  else {
    if (exclusions.has(model)) add('review-model-excluded', `Excluded reviewer model: ${model}; a separately assessed scoped owner override is required.`);
    if (reviewKind === 'internal' && !review.internal.allowed_models.includes(model)) add('review-model-ineligible', 'Reviewer model is not in the exact internal allowlist.');
  }
  return findings;
}

export function checkEvidenceContext({ record, policy, current = {}, code = 'evidence-tuple-stale' }) {
  const findings = [];
  const add = (message) => findings.push({ code, message });
  const fields = record.pr || current.pr
    ? ['pr', 'head', 'base_ref', 'base_sha', 'policy_ref', 'contract_package', 'config_digest', 'activation_digest'] : ['head'];
  for (const field of fields) {
    const equal = field === 'pr' && typeof record.pr === 'string' && typeof current.pr === 'string'
      ? record.pr.toLowerCase() === current.pr.toLowerCase() : isDeepStrictEqual(record[field], current[field]);
    if (!Object.hasOwn(current, field) || !equal) add(`Current ${field} differs from the recorded assessment or is unavailable.`);
  }
  if (record.pr && record.policy_mode !== policy.mode) add('Recorded policy mode differs from current destination policy.');
  if (current.scope !== undefined && record.scope !== current.scope) add('Assessed scope changed.');
  return findings;
}

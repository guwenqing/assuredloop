import { createReadAdapter, workIdentity } from './read-adapter.js';
import { fail, relativePath } from './files.js';
import { validateRecord, collectRecordReferences, hasReviewDeclarations } from './records.js';
import { resolvePolicy, resolveCurrentPolicy } from './policy.js';
import { readRecordBody } from './record-body.js';
import { buildReviewPacket } from './review-packet.js';
import { evaluateCloseout } from './closeout.js';
import { isDeepStrictEqual } from 'node:util';

const key = (ref) => JSON.stringify(ref);
const copySource = (source) => ({ ...source,
  ...(Buffer.isBuffer(source.bytes) ? { bytes: Buffer.from(source.bytes) } : {}),
  ...(source.references ? { references: structuredClone(source.references) } : {}) });
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const normalizeWork = (ref) => {
  const { repository, number } = workIdentity(ref);
  return `${repository}#${number}`;
};
const issueFacts = (issue) => ({ number: issue.number, title: issue.title, repository_url: issue.repository_url, state: issue.state,
  state_reason: issue.state_reason, pull_request: Boolean(issue.pull_request), labels: issue.labels, body: issue.body });

export async function structuredBody(body, { allowPlain = true } = {}) {
  try { return await readRecordBody(body, { allowPlain }); }
  catch (error) {
    if (['record-context-missing', 'record-context-invalid'].includes(error.code) || error instanceof SyntaxError) return null;
    throw error;
  }
}

export const recordReferences = (value) => collectRecordReferences(value).map((ref) => typeof ref === 'string' ? normalizeWork(ref) : ref);

export async function createTrace({ targetRoot, work }) {
  const { repository } = workIdentity(work);
  let adapter = await createReadAdapter({ targetRoot, repository });
  const issues = new Map(), pulls = new Map(), comments = new Map(), bundles = new Map();
  const sourceCache = new Map();
  const findings = [];

  async function issueAt(ref) {
    ref = normalizeWork(ref);
    if (!issues.has(ref)) {
      const identity = workIdentity(ref);
      const issue = await adapter.readIssue(ref);
      if (issue?.number !== identity.number || typeof issue.repository_url !== 'string' || issue.repository_url.toLowerCase() !== `https://api.github.com/repos/${identity.repository}`) fail('binding-invalid', 'GitHub Issue identity differs from the requested work.');
      if (!['open', 'closed'].includes(issue.state)) fail('record-unavailable', 'GitHub Issue state metadata is missing or unsupported.');
      if (issue.body != null && typeof issue.body !== 'string') fail('record-unavailable', 'GitHub Issue body representation is unsupported.');
      issues.set(ref, issue);
    }
    return issues.get(ref);
  }

  async function pullAt(ref) {
    ref = normalizeWork(ref);
    if (!pulls.has(ref)) {
      const identity = workIdentity(ref);
      const pull = await adapter.readPull(ref);
      if (pull?.number !== identity.number || typeof pull.base?.repo?.full_name !== 'string' || pull.base.repo.full_name.toLowerCase() !== identity.repository) fail('binding-invalid', 'GitHub PR identity differs from the requested work.');
      if (!['open', 'closed'].includes(pull.state) || typeof pull.merged !== 'boolean') fail('record-unavailable', 'GitHub PR state/merged metadata is missing or unsupported.');
      if (pull.body != null && typeof pull.body !== 'string') fail('record-unavailable', 'GitHub PR body representation is unsupported.');
      pulls.set(ref, pull);
    }
    return pulls.get(ref);
  }

  async function commentsAt(ref) {
    ref = normalizeWork(ref);
    if (!comments.has(ref)) {
      const identity = workIdentity(ref);
      const rows = await adapter.listComments(ref);
      const entries = [];
      for (const row of rows) {
        const source = { repository: identity.repository, comment_id: row.id };
        if (!validateRecord('commentRef', source).valid || typeof row.body !== 'string') fail('record-unavailable', 'Comment inventory contains an unsupported identity/body.');
        const record = await structuredBody(row.body);
        if (hasReviewDeclarations(record) && !validateRecord('evidence', record).valid) findings.push({ code: 'review-evidence-invalid', message: `Comment ${row.id} has incomplete or invalid review declarations.` });
        sourceCache.set(key(source), { content: row.body, references: recordReferences(record) });
        entries.push({ ref: source, record, body: row.body });
      }
      comments.set(ref, entries);
    }
    return comments.get(ref);
  }

  async function bundleAt(ref) {
    ref = normalizeWork(ref);
    if (bundles.has(ref)) return bundles.get(ref);
    const issue = await issueAt(ref);
    const entries = [...await commentsAt(ref)];
    const refs = new Set();
    if (issue.pull_request) refs.add(ref);
    else {
      for (const entry of entries) if (validateRecord('evidence', entry.record).valid && entry.record.pr) refs.add(normalizeWork(entry.record.pr));
      for (const event of await adapter.listTimeline(ref)) {
        const source = event?.source?.issue;
        if (event.event !== 'cross-referenced' || !source?.pull_request) continue;
        const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/i.exec(source.repository_url || '');
        const sourceWork = match && `${match[1].toLowerCase()}#${source.number}`;
        if (!sourceWork || !validateRecord('work', sourceWork).valid) {
          findings.push({ code: 'relation-identity-unavailable', message: 'A timeline PR relation has no valid structured repository identity.' });
          continue;
        }
        refs.add(sourceWork);
      }
    }
    const related = [];
    for (const pr of refs) {
      const pull = await pullAt(pr);
      const record = await structuredBody(pull.body, { allowPlain: false });
      if (pr !== ref && (!validateRecord('pr', record).valid || !record.issues.some((item) => normalizeWork(item) === ref))) {
        findings.push({ code: 'relation-not-reciprocal', message: `${pr} does not explicitly map to ${ref}.` });
        continue;
      }
      related.push(pull);
      if (pr !== ref) entries.push(...await commentsAt(pr));
    }
    const evidence = [...new Map(entries.filter((entry) => validateRecord('evidence', entry.record).valid).map((entry) => [key(entry.ref), entry])).values()];
    const bundle = { issue, pulls: related, evidence };
    bundles.set(ref, bundle);
    return bundle;
  }

  async function load(ref) {
    if (typeof ref === 'string') ref = normalizeWork(ref);
    if (sourceCache.has(key(ref))) return copySource(sourceCache.get(key(ref)));
    let content, references;
    if (typeof ref === 'string') {
      const issue = await issueAt(ref);
      const record = await structuredBody(issue.body, { allowPlain: false });
      references = recordReferences(record);
      const entries = await commentsAt(ref);
      references.push(...entries.map((entry) => entry.ref));
      const pull = issue.pull_request ? await pullAt(ref) : null;
      if (pull && pull.body !== issue.body) fail('context-source-stale', 'PR body changed between its Issue and PR source reads.');
      const { body, ...facts } = issueFacts(issue);
      content = `${JSON.stringify({ issue: { ...facts, ...(body === null ? { body: null } : {}) }, ...(pull ? { pull: publicBundle({ issue, pulls: [pull] }).pulls[0] } : {}) })}\n\n${body ?? ''}`;
    } else if (Object.hasOwn(ref, 'comment_id')) {
      const comment = await adapter.readComment(ref);
      if (comment?.id !== ref.comment_id || typeof comment.body !== 'string') fail('record-unavailable', 'Referenced comment identity/body is unavailable.');
      content = comment.body;
    } else {
      const bytes = await adapter.readBlob(ref);
      try { content = decode(bytes); }
      catch {
        const result = { bytes: Buffer.from(bytes), disposition: 'unavailable', reason: 'non-text-source' };
        sourceCache.set(key(ref), result);
        return copySource(result);
      }
    }
    const result = { content, references: references || recordReferences(await structuredBody(content)) };
    sourceCache.set(key(ref), result);
    return copySource(result);
  }

  return {
    repository, findings, issueAt, pullAt, bundleAt, load,
    cacheSource: (ref, value) => sourceCache.set(key(ref), value),
    get adapter() { return adapter; },
    async recheckWorkSources() {
      const changed = [];
      for (const [ref, original] of issues) {
        const observed = await adapter.readIssue(ref);
        if (!isDeepStrictEqual(issueFacts(original), issueFacts(observed))) changed.push({ code: 'context-source-stale', message: `${ref}: Issue identity, body or state changed during the assessment.` });
      }
      const seen = new Set();
      for (const [serialized, original] of sourceCache) {
        const ref = JSON.parse(serialized);
        if (!ref || typeof ref !== 'object' || !Object.hasOwn(ref, 'comment_id')) continue;
        const id = `${ref.repository.toLowerCase()}#${ref.comment_id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const observed = await adapter.readComment(ref);
        if (observed?.id !== ref.comment_id || observed?.body !== original.content) changed.push({ code: 'context-source-stale', message: `${id}: referenced comment body changed during the assessment.` });
      }
      return changed;
    },
    async bindPolicyScope(pull) {
      const bytes = await adapter.readBlob({ repository, revision: pull.base.sha, path: '.assuredloop/config.json' });
      const config = JSON.parse(decode(bytes));
      if (!validateRecord('config', config).valid || config.repository.name.toLowerCase() !== repository) fail('policy-unavailable', 'Actual destination repository configuration is invalid.');
      adapter = await createReadAdapter({ targetRoot, repository, allowedRepositories: config.repository.allowed_reference_repositories || [] });
    },
    cacheSources(sources) {
      for (const source of sources) {
        const ref = source.source.kind === 'git-blob' ? source.source.ref : { repository: source.source.repository, comment_id: source.source.comment_id };
        sourceCache.set(key(ref), { content: source.content, references: [] });
      }
    },
  };
}

export async function closeoutContext({ trace, bundle, policies, deltaRef, manifestRef }) {
  const selected = await structuredBody(bundle.issue.body, { allowPlain: false });
  const candidates = bundle.issue.pull_request && validateRecord('pr', selected).valid ? selected.issues : [`${trace.repository}#${bundle.issue.number}`];
  const records = [];
  for (const work of candidates) {
    const issue = await trace.issueAt(work);
    const record = await structuredBody(issue.body, { allowPlain: false });
    if (validateRecord('issue', record).valid && record.activity === 'closeout') records.push({ work, record });
  }
  if (!records.length) {
    if (deltaRef || manifestRef) fail('closeout-context-unavailable', 'Closeout selectors require a mapped closeout work record.');
    return null;
  }
  if (records.length !== 1 || bundle.pulls.length !== 1) fail('closeout-context-unavailable', 'Select one closeout candidate with one unambiguous assigned closeout record.');
  const { work, record } = records[0];
  const policy = policies.find((entry) => entry.assessment?.pr === `${trace.repository}#${bundle.pulls[0].number}`);
  if (policy?.status !== 'available') fail('closeout-policy-unavailable', 'Closeout requires the actual candidate destination policy.');
  const result = await evaluateCloseout({ trace, record, pull: bundle.pulls[0], policy, deltaRef, manifestRef });
  trace.cacheSource(result.directory.ref, { content: result.directory.content, references: result.directory.references });
  const nativeRoots = [];
  const native = { parent: null, children: [], relation: 'membership-only' };
  const identity = (issue) => {
    const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/i.exec(issue?.repository_url || '');
    const ref = match && `${match[1].toLowerCase()}#${issue.number}`;
    if (!ref || !validateRecord('work', ref).valid) fail('native-relation-unavailable', 'Native parent/sub-Issue metadata has no qualified identity.');
    return ref;
  };
  const parent = await trace.adapter.readParent(work);
  if (parent) {
    native.parent = identity(parent);
    nativeRoots.push(native.parent);
    for (const child of await trace.adapter.listChildren(native.parent)) {
      const ref = identity(child);
      native.children.push(ref);
      nativeRoots.push(ref);
    }
  }
  return { ...result, work, record, native, roots: [...result.roots, work, record.request, ...(record.depends_on || []), ...(record.prior_work || []), ...nativeRoots] };
}

export function publicBundle(bundle) {
  const issue = bundle.issue;
  const revision = (value) => ({ sha: value?.sha, ref: value?.ref, repo: { full_name: value?.repo?.full_name } });
  return {
    issue: { number: issue.number, state: issue.state, state_reason: issue.state_reason, ...(issue.body === null ? { body: null } : {}), ...(issue.pull_request ? { pull_request: true } : {}) },
    pulls: bundle.pulls.map((pull) => ({ number: pull.number, head: revision(pull.head), base: revision(pull.base), state: pull.state, merged: pull.merged, merge_commit_sha: pull.merge_commit_sha })),
  };
}

export async function currentTracePolicy(trace) {
  return resolveCurrentPolicy({ adapter: trace.adapter, repository: trace.repository,
    prepareSnapshot: async ({ revision }) => {
      await trace.bindPolicyScope({ base: { sha: revision } });
      return trace.adapter;
    } });
}

export async function inspectWork({ targetRoot, work, maxInlineBytes, cursor = null, expand = [], deltaRef, manifestRef } = {}) {
  const result = { operation: 'inspect', mode: 'live', status: 'pass', work, findings: [] };
  let budget = maxInlineBytes ?? 65536;
  try {
    const trace = await createTrace({ targetRoot, work });
    const bundle = await trace.bundleAt(work);
    result.repository = trace.repository;
    result.context = publicBundle(bundle);
    result.context.pulls = result.context.pulls.map((pull) => ({ number: pull.number, head: { sha: pull.head.sha },
      base: { sha: pull.base.sha, ref: pull.base.ref }, state: pull.state, merged: pull.merged, merge_commit_sha: pull.merge_commit_sha }));
    const policies = [];
    for (const pull of bundle.pulls) {
      await trace.bindPolicyScope(pull);
      policies.push(await resolvePolicy({ adapter: trace.adapter, work: `${trace.repository}#${pull.number}` }));
    }
    if (!policies.length) policies.push(await currentTracePolicy(trace));
    result.policy = { status: policies[0].status, mode: policies[0].mode, policy_ref: policies[0].policy_ref };
    result.context.current = policies[0]?.current;
    for (const policy of policies) {
      result.findings.push(...policy.findings);
      if (policy.status !== 'available') result.status = policy.status === 'invalid' ? 'invalid' : 'unavailable';
      trace.cacheSources(policy.sources || []);
    }
    const budgets = policies.filter((policy) => policy.status === 'available').map((policy) => policy.config.project.review.context.max_inline_bytes);
    budget = Math.min(...budgets, maxInlineBytes ?? 65536);
    if (!budgets.length) fail('policy-unavailable', 'No available policy establishes the inspection budget.');
    const policyRoots = policies.flatMap((policy) => (policy.sources || []).map((source) => source.source.kind === 'git-blob'
      ? source.source.ref : { repository: source.source.repository, comment_id: source.source.comment_id }));
    const closeout = await closeoutContext({ trace, bundle, policies, deltaRef, manifestRef });
    if (closeout) {
      result.synchronization = closeout.synchronization;
      result.manifest = closeout.manifest;
      result.context.native = closeout.native;
      result.findings.push(...closeout.inventoryFindings);
    }
    const changedRoots = [];
    for (const pull of bundle.pulls) {
      const pr = `${trace.repository}#${pull.number}`;
      const files = await trace.adapter.listPullFiles(pr);
      if (!Array.isArray(files)) fail('record-unavailable', 'PR changed-file inventory is unavailable.');
      const observed = await trace.adapter.readPull(pr);
      const tuple = (value) => [value?.number, value?.head?.sha, value?.base?.sha, value?.base?.ref, value?.base?.repo?.full_name?.toLowerCase()];
      if (!isDeepStrictEqual(tuple(pull), tuple(observed))) fail('context-source-stale', 'PR head or destination changed during changed-file acquisition.');
      if (Number.isSafeInteger(observed.changed_files) && observed.changed_files !== files.length) {
        fail('record-unavailable', 'PR changed-files count differs from the acquired inventory; completeness is unresolved.');
      }
      const changes = [];
      for (const file of files) {
        const filename = relativePath(file.filename);
        const ref = { repository: trace.repository, revision: pull.head.sha, path: filename };
        if (!validateRecord('repoRef', ref).valid) fail('record-unavailable', 'PR changed-file reference is invalid.');
        changedRoots.push(ref);
        const before = { ...ref, revision: pull.base.sha, path: file.previous_filename ? relativePath(file.previous_filename) : filename };
        changes.push({ ref, before, status: file.status, additions: file.additions, deletions: file.deletions,
          patch: file.patch ?? null, patch_status: typeof file.patch === 'string' ? 'provided-github-hunk' : 'unavailable' });
        if (file.status !== 'added') changedRoots.push(before);
        if (file.status === 'removed') trace.cacheSource(ref, { disposition: 'unavailable', reason: 'removed-at-head', references: [] });
      }
      const source = await trace.load(pr);
      trace.cacheSource(pr, { ...source, content: `${source.content}\n\n${JSON.stringify({ changed_files: changes })}`,
        references: [...source.references, ...changedRoots] });
    }
    const declaredRoots = recordReferences(await structuredBody(bundle.issue.body, { allowPlain: false }));
    for (const pull of bundle.pulls) declaredRoots.push(...recordReferences(await structuredBody(pull.body, { allowPlain: false })));
    const roots = [...(closeout?.roots || []), work, ...bundle.pulls.map((pull) => `${trace.repository}#${pull.number}`), ...bundle.evidence.map((entry) => entry.ref), ...policyRoots, ...changedRoots, ...declaredRoots];
    const normalizedRoots = roots.map((ref) => typeof ref === 'string' ? normalizeWork(ref) : ref);
    result.findings.push(...trace.findings);
    result.findings = [...new Map(result.findings.map((finding) => [key(finding), finding])).values()];
    result.packet = await buildReviewPacket({ roots: [...new Map(normalizedRoots.map((ref) => [key(ref), ref])).values()], load: trace.load, maxInlineBytes: budget, cursor,
      expand: expand.map((ref) => typeof ref === 'string' ? normalizeWork(ref) : ref), envelope: result });
  } catch (error) {
    result.status = 'unavailable';
    result.findings.push({ code: error.code || 'inspection-unavailable', message: error.message, details: error.details });
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') + 1 > budget) return { operation: 'inspect', status: 'unavailable', findings: [{ code: 'packet-limit' }] };
  return result;
}

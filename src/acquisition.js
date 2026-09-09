import { createHash } from 'node:crypto';
import { createReadAdapter, workIdentity } from './read-adapter.js';
import { validateRecord } from './records.js';
import { fail } from './files.js';
import { isDeepStrictEqual } from 'node:util';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tuple = (pull) => [pull?.number, pull?.head?.sha, pull?.base?.sha, pull?.base?.ref, pull?.base?.repo?.full_name?.toLowerCase()];

export async function establishAcquisition({ targetRoot, work, issue, pull, initialAdapter }) {
  const { repository } = workIdentity(work);
  function parseConfig(bytes, name) {
    const config = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const validation = validateRecord('config', config);
    if (!validation.valid || config.repository.name.toLowerCase() !== name) fail('policy-unavailable', 'Current acquisition configuration is invalid.', validation.errors);
    return config;
  }
  async function configAt(reader, name, revision) {
    const ref = { repository: name, revision, path: '.assuredloop/config.json' };
    const bytes = await reader.readBlob(ref);
    const config = parseConfig(bytes, name);
    return { ref, bytes, config, allowed: new Set([name, ...(config.repository.allowed_reference_repositories || []).map((value) => value.toLowerCase())]) };
  }
  let branch, revision;
  if (issue.pull_request) {
    branch = pull.base.ref;
    revision = pull.base.sha;
    let observed;
    try { observed = await initialAdapter.readBranchHead({ repository, branch }); }
    catch (error) {
      fail(error.code || 'acquisition-context-unavailable', `Current primary destination context is unavailable: ${error.message}`, {
        ...error.details, repository, branch, assessed_base_sha: revision,
      });
    }
    if (pull.merged !== true && observed !== revision) fail('acquisition-context-stale', 'The current primary PR destination changed before acquisition.', {
      assessment: { pr: work, head: pull.head?.sha, base_ref: branch, base_sha: revision }, observed_base_sha: observed,
    });
    revision = observed;
  } else {
    const metadata = await initialAdapter.readRepository(repository);
    branch = metadata.default_branch;
    if (typeof branch !== 'string' || !branch) fail('policy-unavailable', 'The primary Issue repository has no current default-branch context.');
    revision = await initialAdapter.readBranchHead({ repository, branch });
  }
  const primary = await configAt(initialAdapter, repository, revision);
  const ceiling = primary.allowed;
  const makeReader = (allowed) => createReadAdapter({ targetRoot, repository, allowedRepositories: [...allowed] });
  const reader = await makeReader(ceiling);
  let active = { reader, allowed: ceiling };
  const contexts = [];
  const classifications = new Map();
  const context = { kind: issue.pull_request ? 'pr-destination' : 'repository-default', work, repository, branch, revision,
    config_ref: primary.ref, config_digest: digest(primary.bytes), allowed_repositories: [...ceiling].sort() };

  return {
    context, contexts,
    async classificationConfig(work) {
      this.authorize(work);
      const name = workIdentity(work).repository;
      if (name === repository) return { mapping: primary.config.repository.labels.type,
        provenance: { repository, branch, revision, config_ref: primary.ref, config_digest: digest(primary.bytes) } };
      const cacheKey = `${this.scopeKey}:${name}`;
      let selected = classifications.get(cacheKey);
      const provenance = selected?.provenance ?? { repository: name };
      try {
        if (!selected) {
          const metadata = await active.reader.readRepository(name);
          const branch = metadata.default_branch;
          if (typeof branch !== 'string' || !branch) fail('category-config-unavailable', 'Foreign Issue repository has no current default branch.', { repository: name });
          provenance.branch = branch;
          const revision = await active.reader.readBranchHead({ repository: name, branch });
          provenance.revision = revision;
          const ref = { repository: name, revision, path: '.assuredloop/config.json' };
          provenance.config_ref = ref;
          const bytes = await active.reader.readBlob(ref);
          provenance.config_digest = digest(bytes);
          selected = { ref, bytes, repository: name, branch, revision, provenance, allowed: new Set(active.allowed) };
          classifications.set(cacheKey, selected);
          try { selected.config = parseConfig(bytes, name); }
          catch (error) { selected.error = error; }
        }
        if (selected.error) throw selected.error;
        return { mapping: selected.config.repository.labels.type, provenance,
          source: { ref: selected.ref, bytes: selected.bytes } };
      } catch (error) {
        error.classification = { provenance,
          ...(selected ? { source: { ref: selected.ref, bytes: selected.bytes } } : {}) };
        throw error;
      }
    },
    source: { source: { kind: 'git-blob', ref: primary.ref }, content: primary.bytes.toString('utf8'), content_sha256: digest(primary.bytes) },
    get adapter() { return active.reader; },
    get scopeKey() { return [...active.allowed].sort().join(','); },
    authorize(ref) {
      const name = typeof ref === 'string' ? workIdentity(ref).repository : ref?.repository?.toLowerCase();
      if (!active.allowed.has(name)) fail('reference-out-of-scope', 'Reference is outside the current request/assessment acquisition scope.', { repository: name });
    },
    reset() { active = { reader, allowed: ceiling }; },
    async narrow(candidate) {
      const name = candidate.base.repo.full_name.toLowerCase();
      const pr = `${name}#${candidate.number}`;
      let branch = candidate.base.ref, currentRevision;
      try {
        const observed = await reader.readPull(pr);
        if (observed?.number !== candidate.number || observed?.base?.repo?.full_name?.toLowerCase() !== name) fail('binding-invalid', 'Secondary PR identity changed.');
        branch = observed.base.ref;
        currentRevision = await reader.readBranchHead({ repository: name, branch });
        const scoped = await configAt(reader, name, currentRevision);
        const allowed = new Set([repository, ...[...scoped.allowed].filter((value) => ceiling.has(value))]);
        active = { reader: await makeReader(allowed), allowed };
        const item = { work: pr, config_ref: scoped.ref, config_digest: digest(scoped.bytes),
          allowed_repositories: [...allowed].sort(), denied_by_ceiling: [...scoped.allowed].filter((value) => !ceiling.has(value)).sort() };
        if (!contexts.some((entry) => isDeepStrictEqual(entry, item))) contexts.push(item);
        return item;
      } catch (error) {
        fail('secondary-acquisition-unavailable', `${pr}: current destination context is unavailable: ${error.message}`, {
          work: pr, repository: name, branch,
          ...(currentRevision ? { config_ref: { repository: name, revision: currentRevision, path: '.assuredloop/config.json' } } : {}),
          cause: error.code || 'invalid-source', cause_details: error.details,
        });
      }
    },
    async within(candidate, action) {
      const previous = active;
      try { await this.narrow(candidate); return await action(); }
      finally { active = previous; }
    },
    async recheck() {
      for (const selected of classifications.values()) {
        this.authorize(selected.ref);
        const allowed = new Set([...selected.allowed].filter((name) => active.allowed.has(name)));
        const scopedReader = await makeReader(allowed);
        const metadata = await scopedReader.readRepository(selected.repository);
        const revision = await scopedReader.readBranchHead({ repository: selected.repository, branch: selected.branch });
        if (metadata.default_branch !== selected.branch || revision !== selected.revision) fail('acquisition-context-stale', 'Foreign Issue classification default branch or revision changed.', { repository: selected.repository });
        const current = await scopedReader.readBlob(selected.ref);
        if (digest(current) !== digest(selected.bytes)) fail('acquisition-context-stale', 'Foreign Issue classification configuration changed.', { config_ref: selected.ref });
      }
      if (issue.pull_request) {
        const observed = await reader.readPull(work);
        if (!isDeepStrictEqual(tuple(pull), tuple(observed))) fail('acquisition-context-stale', 'The current primary PR changed during acquisition.');
      } else {
        const metadata = await reader.readRepository(repository);
        if (metadata.default_branch !== branch) fail('acquisition-context-stale', 'The current primary default branch changed during acquisition.');
      }
      const observedRevision = await reader.readBranchHead({ repository, branch });
      if (observedRevision !== revision) fail('acquisition-context-stale', 'The current primary destination revision changed during acquisition.');
      const observed = await configAt(reader, repository, observedRevision);
      if (digest(observed.bytes) !== context.config_digest) fail('acquisition-context-stale', 'The primary acquisition permission configuration changed.');
    },
  };
}

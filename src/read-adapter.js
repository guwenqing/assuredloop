import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { execFile, fail, git, relativePath, repositoryIdentity, repositoryRoot } from './files.js';
import { githubAuthentication } from './native.js';
import { validateRecord } from './records.js';
import { readSnapshotBatch } from './github-snapshot-batch.js';

function repositoryName(value) {
  if (!validateRecord('repository', value).valid) fail('binding-invalid', 'Expected an explicit owner/repository identity.');
  return value.toLowerCase();
}

export function workIdentity(value) {
  if (!validateRecord('work', value).valid) fail('binding-invalid', 'Expected a qualified owner/repository#number reference.');
  const [repository, number] = value.split('#');
  return { repository: repositoryName(repository), number: Number(number) };
}

function githubFailure(error, accessConfirmed = false) {
  const message = String(error.stderr || error.message);
  const missing = /HTTP 404/.test(message);
  if (missing && accessConfirmed) fail('record-unavailable', 'The record is unavailable in the accessible repository.', { reason: 'not-found' });
  const reason = /rate.limit|HTTP 429/i.test(message) ? 'rate-limited'
    : /HTTP 401/.test(message) ? 'authentication-required'
      : /HTTP (403|404)/.test(message) ? 'insufficient-access' : 'transport-error';
  const details = { reason };
  if (reason === 'rate-limited') {
    const retry = /Retry-After:\s*(\d+)/i.exec(message);
    const reset = /X-RateLimit-Reset:\s*(\d+)/i.exec(message);
    if (retry) details.retry_after_seconds = Number(retry[1]);
    if (reset && Number(reset[1]) <= 8640000000000) details.retry_at = new Date(Number(reset[1]) * 1000).toISOString();
  }
  fail('tool-unavailable', 'The bound GitHub read could not complete.', details);
}

async function rawObjectRead(root, args) {
  try {
    return (await execFile('git', ['--no-replace-objects', '-C', root, ...args], {
      encoding: 'buffer', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    })).stdout;
  } catch (error) {
    if (error.code === 'ENOENT') fail('tool-unavailable', 'Git is unavailable.', { reason: 'missing-binary' });
    fail('record-unavailable', 'The requested Git object is unavailable.', { reason: 'git-object-unavailable' });
  }
}

function treeEntries(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('path-unsafe', 'Git tree contains a path that cannot be represented as UTF-8.'); }
  return text.split('\0').filter(Boolean).map((entry) => {
    const match = /^(\d{6}) (blob|tree|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
    if (!match) fail('record-unavailable', 'Unsupported Git tree entry.');
    relativePath(match[4]);
    return { path: match[4], mode: match[1], type: match[2], sha: match[3] };
  });
}

// Shared only by adapters belonging to one explicitly created operation.
const operations = new WeakMap();
const clone = (value) => Buffer.isBuffer(value) ? Buffer.from(value) : structuredClone(value);
const rawMedia = 'application/vnd.github.raw+json';
const requestKey = (repository, resource, paginate, media = rawMedia) => JSON.stringify([repository, resource, paginate, media]);
const pick = (value, names) => value && Object.fromEntries(names.map((name) => [name, value[name]]));
const revisionFacts = (value) => value && ({ sha: value.sha, ref: value.ref, repository: value.repo?.full_name?.toLowerCase() });
function sourceFacts(resource, value) {
  if (/^pulls\/\d+$/.test(resource)) return { ...pick(value, ['number', 'body', 'state', 'merged', 'merged_at', 'merge_commit_sha', 'changed_files']),
    head: revisionFacts(value?.head), base: revisionFacts(value?.base) };
  if (/^issues\/\d+$/.test(resource)) return { ...pick(value, ['number', 'title', 'body', 'state', 'state_reason', 'repository_url']),
    pull_request: Boolean(value?.pull_request), labels: value?.labels?.map((label) => label.name).sort() };
  if (/^issues\/comments\/\d+$/.test(resource)) return pick(value, ['id', 'body']);
  if (/^issues\/\d+\/comments$/.test(resource)) return value.map((item) => pick(item, ['id', 'body']));
  if (/^issues\/\d+\/timeline$/.test(resource)) return value.filter((item) => item.event === 'cross-referenced')
    .map((item) => ({ event: item.event, source: pick(item.source?.issue, ['number', 'repository_url', 'pull_request', 'body']) }));
  if (/^issues\/\d+\/(parent|sub_issues)$/.test(resource)) return Array.isArray(value)
    ? value.map((item) => pick(item, ['number', 'repository_url'])) : pick(value, ['number', 'repository_url']);
  return value;
}

async function reuse(cache, key, action) {
  if (!cache) return action();
  if (!cache.has(key)) {
    const pending = Promise.resolve().then(action);
    cache.set(key, pending);
    // A failed observation remains a rejection, never successful source data.
    // Fresh verification and subsequent commands own separate caches.
  }
  return clone(await cache.get(key));
}

export async function createReadAdapter({ targetRoot, repository, referenceRoots = {}, allowedRepositories = [], localOnly = false,
  cacheReads = false, sharedWith } = {}) {
  const bound = repositoryName(repository);
  const target = await repositoryRoot(targetRoot);
  if (repositoryIdentity(await git(target, ['remote', 'get-url', 'origin'])) !== bound) {
    fail('binding-invalid', 'Selected target origin does not match its explicit repository binding.');
  }
  if (!Array.isArray(allowedRepositories) || !referenceRoots || typeof referenceRoots !== 'object' || Array.isArray(referenceRoots)) {
    fail('binding-invalid', 'Reference permissions and roots must be explicit collections.');
  }
  const allowed = new Set([bound, ...allowedRepositories.map(repositoryName)]);
  const roots = new Map([[bound, target]]);
  const suppliedRoots = new Map(Object.entries(referenceRoots).map(([name, root]) => [repositoryName(name), root]));
  const inherited = sharedWith && operations.get(sharedWith);
  if (sharedWith && (!inherited || inherited.target !== target || inherited.bound !== bound ||
      inherited.localOnly !== localOnly || !isDeepStrictEqual(inherited.referenceRoots, referenceRoots))) {
    fail('binding-invalid', 'Shared acquisition must retain the same explicit target and local bindings.');
  }
  const operation = inherited || { target, bound, localOnly, referenceRoots, enabled: cacheReads,
    responses: new Map(), repositories: new Map(), objects: new Map(), gitObjects: new Map(), localInventories: new Map(), observations: new Map(), readers: new Map(), authenticated: false };
  const cached = operation.enabled;
  const objectRead = (root, args) => reuse(cached ? operation.gitObjects : null, JSON.stringify([root, args]), () => rawObjectRead(root, args));
  async function authenticate() {
    if (!operation.authenticated) {
      if (!operation.authentication) operation.authentication = githubAuthentication().catch((error) => {
        operation.authentication = null; throw error;
      });
      await operation.authentication;
      operation.authenticated = true;
    }
  }

  function scope(name) {
    const normalized = repositoryName(name);
    if (!allowed.has(normalized)) fail('reference-out-of-scope', 'Reference repository is outside the explicit permitted scope.');
    return normalized;
  }

  async function localRoot(name) {
    const normalized = scope(name);
    if (roots.has(normalized)) return roots.get(normalized);
    if (!suppliedRoots.has(normalized)) fail('record-unavailable', 'No explicitly bound local checkout contains this reference.', { reason: 'checkout-unavailable' });
    const root = await repositoryRoot(suppliedRoots.get(normalized));
    if (repositoryIdentity(await git(root, ['remote', 'get-url', 'origin'])) !== normalized) {
      fail('binding-invalid', 'Reference checkout origin does not match its explicit binding.');
    }
    roots.set(normalized, root);
    return root;
  }

  async function source(ref) {
    relativePath(ref?.path);
    if (!validateRecord('repoRef', ref).valid) fail('binding-invalid', 'Git reads require a structured fixed-revision RepoRef.');
    const root = await localRoot(ref.repository);
    const type = (await objectRead(root, ['cat-file', '-t', ref.revision])).toString('utf8').trim();
    if (type !== 'commit') fail('binding-invalid', 'The selected revision must identify a commit.');
    const inventoried = operation.localInventories.get(JSON.stringify([root, ref.revision]))?.get(ref.path);
    if (inventoried) {
      // A recursive Git inventory reaches this exact entry without traversing
      // symlinks or submodules. Do not ask ls-tree again for every prefix/file.
      scopedEntry(inventoried);
      return root;
    }
    let prefix = '';
    for (const part of ref.path === '.' ? [] : ref.path.split('/')) {
      prefix = prefix ? `${prefix}/${part}` : part;
      const entries = treeEntries(await objectRead(root, ['ls-tree', '-z', ref.revision, '--', prefix]));
      const entry = entries.find((item) => item.path === prefix);
      if (!entry) fail('record-unavailable', 'The referenced path does not exist at the selected revision.', { reason: 'path-missing' });
      if (entry.mode === '120000' || entry.mode === '160000') fail('path-unsafe', 'Symbolic links and submodule paths are not scoped file evidence.');
    }
    return root;
  }

  async function rawApi(endpoint, paginate = false, media = 'application/vnd.github.raw+json') {
    const args = ['api', endpoint, '--hostname', 'github.com', '--method', 'GET',
      '-H', `Accept: ${media}`, '-H', 'X-GitHub-Api-Version: 2022-11-28'];
    if (paginate) args.push('--paginate', '--slurp');
    const { stdout } = await execFile('gh', args, { maxBuffer: 16 * 1024 * 1024 });
    try { return JSON.parse(stdout); }
    catch { fail('record-unavailable', 'GitHub returned an unsupported JSON representation.', { reason: 'invalid-response' }); }
  }

  async function confirmRepository(name, fresh = false) {
    return reuse(cached && !fresh ? operation.repositories : null, name, async () => {
      let info;
      try { info = await rawApi(`repos/${name}`); }
      catch (error) {
        if (error.code === 'record-unavailable') throw error;
        githubFailure(error);
      }
      if (typeof info?.full_name !== 'string' || info.full_name.toLowerCase() !== name) {
        fail('binding-invalid', 'GitHub repository rename/redirect requires an explicit verified binding update.');
      }
      return info;
    });
  }

  async function api(name, resource, paginate = false, media) {
    const normalized = scope(name);
    if (localOnly) fail('tool-unavailable', 'GitHub reads are skipped in local-only diagnostics.', { reason: 'local-only' });
    const key = requestKey(normalized, resource, paginate, media);
    const result = await reuse(cached ? operation.responses : null, key, async () => {
      await authenticate();
      await confirmRepository(normalized);
      let result;
      try { result = await rawApi(`repos/${normalized}/${resource}${paginate ? '?per_page=100' : ''}`, paginate, media); }
      catch (error) {
        if (error.code === 'record-unavailable') throw error;
        if (/HTTP 404/.test(String(error.stderr || error.message))) await confirmRepository(normalized, true);
        githubFailure(error, true);
      }
      if (paginate) {
        if (!Array.isArray(result) || result.some((page) => !Array.isArray(page))) fail('record-unavailable', 'GitHub pagination did not return complete array pages.');
        result = result.flat();
      }
      return result;
    });
    if (cached) {
      const seed = (resource, value, paginated = false) => {
        const derivedKey = requestKey(normalized, resource, paginated, media);
        if (!operation.responses.has(derivedKey)) operation.responses.set(derivedKey, Promise.resolve(structuredClone(value)));
      };
      const issueObjects = /^issues\/\d+\/(parent|sub_issues)$/.test(resource) ? (Array.isArray(result) ? result : [result])
        : /^issues\/\d+\/timeline$/.test(resource) ? result.map(item => item.source?.issue) : [];
      for (const item of issueObjects) {
          if (Number.isSafeInteger(item?.number) && item.repository_url?.toLowerCase() === `https://api.github.com/repos/${normalized}` &&
              ['open', 'closed'].includes(item.state) && Object.hasOwn(item, 'body') && Array.isArray(item.labels)) {
            seed(`issues/${item.number}`, item);
          }
      }
      let comments = /^issues\/\d+\/comments$/.test(resource) ? result : null;
      if (paginate && /^issues\/\d+\/timeline$/.test(resource)) {
        const issueResource = resource.slice(0, -'/timeline'.length);
        const known = operation.responses.get(requestKey(normalized, issueResource, false, media));
        const issue = known && await known;
        const entries = result.filter(item => item.event === 'commented');
        if (Number.isSafeInteger(issue?.comments) && entries.length === issue.comments &&
            entries.every(item => Number.isSafeInteger(item.id) && typeof item.body === 'string' &&
              item.issue_url?.toLowerCase() === `https://api.github.com/repos/${normalized}/${issueResource}`)) {
          comments = entries.map(({ event, actor, ...comment }) => comment);
          seed(`${issueResource}/comments`, comments, true);
        }
      }
      if (comments) for (const comment of comments) {
        if (Number.isSafeInteger(comment?.id) && typeof comment.body === 'string') seed(`issues/comments/${comment.id}`, comment);
      }
      // Track consumed objects even when their bytes came from a complete list.
      if (!/^git\/(commits|trees|blobs)\//.test(resource) && !operation.observations.has(key)) {
        operation.observations.set(key, { normalized, resource, paginate, media, value: structuredClone(result) });
      }
    }
    return result;
  }

  async function workRead(work, collection, suffix = '', paginate = false) {
    const ref = workIdentity(work);
    return api(ref.repository, `${collection}/${ref.number}${suffix}`, paginate);
  }

  function unavailable() {
    fail('record-unavailable', 'GitHub returned an inconsistent or unsupported Git object.', { reason: 'invalid-response' });
  }

  async function remoteObject(repository, kind, sha) {
    if (!/^[a-f0-9]{40}$/.test(sha)) unavailable();
    const result = await api(repository, `git/${kind}/${sha}`, false, 'application/vnd.github+json');
    if (result?.sha !== sha) unavailable();
    return result;
  }

  async function remoteTree(repository, sha) {
    const result = await remoteObject(repository, 'trees', sha);
    if (result.truncated !== false || !Array.isArray(result.tree)) unavailable();
    const names = new Set();
    return result.tree.map((entry) => {
      if (typeof entry?.path !== 'string') unavailable();
      relativePath(entry.path);
      if (entry.path === '.' || entry.path.includes('/') || names.has(entry.path)) unavailable();
      names.add(entry.path);
      if (!/^[a-f0-9]{40}$/.test(entry.sha)) unavailable();
      const type = { '040000': 'tree', '100644': 'blob', '100755': 'blob', '120000': 'blob', '160000': 'commit' }[entry.mode];
      if (!type || entry.type !== type) unavailable();
      return { path: entry.path, mode: entry.mode, type, sha: entry.sha };
    });
  }

  function scopedEntry(entry) {
    if (entry.mode === '120000' || entry.mode === '160000') fail('path-unsafe', 'Symbolic links and submodule paths are not scoped file evidence.');
    return entry;
  }

  async function remoteSource(ref) {
    const commit = await remoteObject(ref.repository, 'commits', ref.revision);
    if (!/^[a-f0-9]{40}$/.test(commit.tree?.sha)) unavailable();
    let selected = { path: '.', mode: '040000', type: 'tree', sha: commit.tree.sha };
    let prefix = '';
    for (const part of ref.path === '.' ? [] : ref.path.split('/')) {
      if (selected.type !== 'tree') fail('record-unavailable', 'The referenced path does not exist.', { reason: 'path-missing' });
      const entries = await remoteTree(ref.repository, selected.sha);
      const next = entries.find((entry) => entry.path === part);
      if (!next) fail('record-unavailable', 'The referenced path does not exist.', { reason: 'path-missing' });
      prefix = prefix ? `${prefix}/${part}` : part;
      selected = { ...scopedEntry(next), path: prefix };
    }
    return selected;
  }

  async function withRemoteFallback(ref, local, remote) {
    try { return await local(await source(ref)); }
    catch (error) {
      if (localOnly || error.code !== 'record-unavailable' ||
          !['git-object-unavailable', 'checkout-unavailable'].includes(error.details?.reason)) throw error;
      return remote(await remoteSource(ref));
    }
  }

  const adapter = {
    cacheReads: cached,
    repository: bound,
    targetRoot: target,
    localOnly,
    async readRepository(name) {
      const normalized = scope(name);
      if (localOnly) fail('tool-unavailable', 'GitHub reads are skipped in local-only diagnostics.', { reason: 'local-only' });
      await authenticate();
      return confirmRepository(normalized);
    },
    async readBranchHead({ repository: name, branch } = {}) {
      const normalized = scope(name);
      if (typeof branch !== 'string' || !branch || branch.startsWith('-') || branch === '@' ||
          branch.includes('..') || branch.includes('@{') || /[\s\x00-\x1f\x7f~^:?*\[\\$`;&|()<>"']/.test(branch) ||
          branch.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock'))) {
        fail('binding-invalid', 'Expected a supported explicit branch name, not a command or URL.');
      }
      const result = await api(normalized, `git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`);
      if (result?.ref !== `refs/heads/${branch}` || result?.object?.type !== 'commit' || !validateRecord('sha', result?.object?.sha).valid) unavailable();
      return result.object.sha;
    },
    async readCommit({ repository: name, revision } = {}) {
      const ref = { repository: scope(name), revision, path: '.' };
      const commit = await withRemoteFallback(ref, async (root) => {
        const raw = (await objectRead(root, ['cat-file', 'commit', revision])).toString('utf8').split('\n\n', 1)[0];
        return { sha: revision, tree: { sha: /^tree ([a-f0-9]{40})$/m.exec(raw)?.[1] },
          parents: [...raw.matchAll(/^parent ([a-f0-9]{40})$/gm)].map((match) => ({ sha: match[1] })) };
      }, () => remoteObject(ref.repository, 'commits', revision));
      if (commit.sha !== revision || !validateRecord('sha', commit.tree?.sha).valid || !Array.isArray(commit.parents) || commit.parents.some((parent) => !validateRecord('sha', parent.sha).valid)) unavailable();
      return { sha: commit.sha, tree: { sha: commit.tree.sha }, parents: commit.parents.map(({ sha }) => ({ sha })) };
    },
    async readBlob(ref) {
      return withRemoteFallback(ref, async (root) => {
        let file = operation.localInventories.get(JSON.stringify([root, ref.revision]))?.get(ref.path);
        if (!file) {
          const entries = treeEntries(await objectRead(root, ['ls-tree', '-z', ref.revision, '--', ref.path]));
          file = entries.find((entry) => entry.path === ref.path && entry.type === 'blob');
        }
        if (!file || file.type !== 'blob') fail('record-unavailable', 'Reference does not identify a file blob.', { reason: 'not-a-blob' });
        return objectRead(root, ['cat-file', 'blob', file.sha]);
      }, async (file) => {
        if (file.type !== 'blob') fail('record-unavailable', 'Reference does not identify a file blob.', { reason: 'not-a-blob' });
        const blob = await remoteObject(ref.repository, 'blobs', file.sha);
        if (blob.encoding !== 'base64' || typeof blob.content !== 'string') unavailable();
        const encoded = blob.content.replace(/[\r\n]/g, '');
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.toString('base64') !== encoded || blob.size !== bytes.length) unavailable();
        const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        if (actual !== file.sha) unavailable();
        return bytes;
      });
    },
    async listFiles(ref) {
      return withRemoteFallback(ref, async (root) => {
        const entries = treeEntries(await objectRead(root, ['ls-tree', '-r', '-z', ref.revision, '--', ref.path]));
        if (cached) {
          const key = JSON.stringify([root, ref.revision]);
          if (!operation.localInventories.has(key)) operation.localInventories.set(key, new Map());
          const inventory = operation.localInventories.get(key);
          for (const entry of entries) inventory.set(entry.path, entry);
        }
        return entries;
      }, async (selected) => {
        const result = [];
        const pending = [selected];
        let visited = 0;
        while (pending.length) {
          if (++visited > 10000) fail('record-unavailable', 'Git tree inventory exceeds the bounded read limit.');
          const current = scopedEntry(pending.pop());
          if (current.type === 'blob') result.push(current);
          else {
            const entries = await remoteTree(ref.repository, current.sha);
            for (const entry of entries) pending.push({ ...entry, path: current.path === '.' ? entry.path : `${current.path}/${entry.path}` });
          }
        }
        return result.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      });
    },
    readIssue: (work) => workRead(work, 'issues'),
    readPull: (work) => workRead(work, 'pulls'),
    listComments: (work) => workRead(work, 'issues', '/comments', true),
    listTimeline: (work) => workRead(work, 'issues', '/timeline', true),
    listChildren: (work) => workRead(work, 'issues', '/sub_issues', true),
    listPullFiles: (work) => workRead(work, 'pulls', '/files', true),
    async readParent(work) {
      try { return await workRead(work, 'issues', '/parent'); }
      catch (error) { if (error.code === 'record-unavailable' && error.details?.reason === 'not-found') return null; throw error; }
    },
    readComment(ref) {
      if (!validateRecord('commentRef', ref).valid) fail('binding-invalid', 'Expected a structured comment reference.');
      return api(ref.repository, `issues/comments/${ref.comment_id}`);
    },
  };
  // Fixed-object cache keys include repository, revision, path and operation.
  for (const method of ['readBlob', 'listFiles', 'readCommit']) {
    const read = adapter[method];
    adapter[method] = async (ref) => {
      scope(ref?.repository);
      if (method !== 'readCommit') relativePath(ref?.path);
      if (!validateRecord(method === 'readCommit' ? 'sha' : 'repoRef', method === 'readCommit' ? ref?.revision : ref).valid) {
        fail('binding-invalid', 'Fixed object reads require a valid revision and reference.');
      }
      return reuse(cached ? operation.objects : null, JSON.stringify([method, ref.repository.toLowerCase(), ref.revision, ref.path]), () => read(ref));
    };
  }
  const allowedKey = (names) => [...new Set([bound, ...names.map(repositoryName)])].sort().join(',');
  adapter.scoped = (allowedRepositories) => {
    const key = allowedKey(allowedRepositories);
    if (cached && operation.readers.has(key)) return operation.readers.get(key);
    const pending = createReadAdapter({ targetRoot: target, repository: bound,
      referenceRoots, allowedRepositories, localOnly, sharedWith: adapter });
    if (cached) operation.readers.set(key, pending);
    return pending;
  };
  adapter.fresh = () => createReadAdapter({ targetRoot: target, repository: bound,
    referenceRoots, allowedRepositories: [...allowed], localOnly, cacheReads: cached });
  adapter.recheck = async (fresh) => {
    const changed = [];
    const observations = [...operation.observations.values()];
    const priority = ({ resource, value }) => /\/(parent|sub_issues)$/.test(resource) ? 0
      : /^issues\/\d+$/.test(resource) && !value.pull_request ? 1 : /\/timeline$/.test(resource) ? 2 : /\/comments$/.test(resource) ? 3 : 4;
    observations.sort((a, b) => priority(a) - priority(b));
    const permitted = observations.filter(item => {
      try { scope(item.normalized); return true; }
      catch (error) { if (error.code === 'reference-out-of-scope') return false; throw error; }
    });
    await operations.get(fresh).batches.get(fresh)(permitted);
    for (const item of permitted) {
      const observed = await operations.get(fresh).apis.get(fresh)(item.normalized, item.resource, item.paginate, item.media);
      if (!isDeepStrictEqual(sourceFacts(item.resource, item.value), sourceFacts(item.resource, observed))) changed.push({ code: 'context-source-stale',
        message: `${item.normalized}/${item.resource}: remote source changed during the assessment.` });
    }
    return changed;
  };
  operations.set(adapter, operation);
  if (cached && !operation.readers.has(allowedKey([...allowed]))) operation.readers.set(allowedKey([...allowed]), Promise.resolve(adapter));
  operation.apis ??= new WeakMap();
  operation.apis.set(adapter, api);
  operation.batches ??= new WeakMap();
  operation.batches.set(adapter, async observations => {
    if (!cached || localOnly) return;
    const snapshots = await readSnapshotBatch(observations, async query => {
      for (const name of new Set(observations.map(item => item.normalized))) scope(name);
      await authenticate();
      for (const name of new Set(observations.map(item => item.normalized))) await confirmRepository(name);
      const { stdout } = await execFile('gh', ['api', 'graphql', '--hostname', 'github.com', '--method', 'POST', '-f', `query=${query}`],
        { maxBuffer: 16 * 1024 * 1024, timeout: 20000 });
      return JSON.parse(stdout);
    });
    for (const item of snapshots) {
      const key = requestKey(item.normalized, item.resource, item.paginate, item.media);
      if (!operation.responses.has(key)) operation.responses.set(key, Promise.resolve(item.value));
    }
  });
  return adapter;
}

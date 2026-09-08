import { execFile, fail, git, relativePath, repositoryIdentity, repositoryRoot } from './files.js';
import { githubAuthentication } from './native.js';
import { validateRecord } from './records.js';

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
  if (missing && accessConfirmed) fail('record-unavailable', 'The record is unavailable in the accessible repository.');
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

async function objectRead(root, args) {
  try {
    return (await execFile('git', ['--no-replace-objects', '-C', root, ...args], {
      encoding: 'buffer', maxBuffer: 16 * 1024 * 1024,
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

export async function createReadAdapter({ targetRoot, repository, referenceRoots = {}, allowedRepositories = [], localOnly = false } = {}) {
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
  let authenticated = false;

  function scope(name) {
    const normalized = repositoryName(name);
    if (!allowed.has(normalized)) fail('reference-out-of-scope', 'Reference repository is outside the explicit permitted scope.');
    return normalized;
  }

  async function localRoot(name) {
    const normalized = scope(name);
    if (roots.has(normalized)) return roots.get(normalized);
    if (!suppliedRoots.has(normalized)) fail('record-unavailable', 'No explicitly bound local checkout contains this reference.');
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
    let prefix = '';
    for (const part of ref.path === '.' ? [] : ref.path.split('/')) {
      prefix = prefix ? `${prefix}/${part}` : part;
      const entries = treeEntries(await objectRead(root, ['ls-tree', '-z', ref.revision, '--', prefix]));
      const entry = entries.find((item) => item.path === prefix);
      if (!entry) fail('record-unavailable', 'The referenced path does not exist at the selected revision.');
      if (entry.mode === '120000' || entry.mode === '160000') fail('path-unsafe', 'Symbolic links and submodule paths are not scoped file evidence.');
    }
    return root;
  }

  async function rawApi(endpoint, paginate = false) {
    const args = ['api', endpoint, '--hostname', 'github.com', '--method', 'GET',
      '-H', 'Accept: application/vnd.github.raw+json', '-H', 'X-GitHub-Api-Version: 2022-11-28'];
    if (paginate) args.push('--paginate', '--slurp');
    const { stdout } = await execFile('gh', args, { maxBuffer: 16 * 1024 * 1024 });
    try { return JSON.parse(stdout); }
    catch { fail('record-unavailable', 'GitHub returned an unsupported JSON representation.'); }
  }

  async function confirmRepository(name) {
    let info;
    try { info = await rawApi(`repos/${name}`); }
    catch (error) {
      if (error.code === 'record-unavailable') throw error;
      githubFailure(error);
    }
    if (typeof info?.full_name !== 'string' || info.full_name.toLowerCase() !== name) {
      fail('binding-invalid', 'GitHub repository rename/redirect requires an explicit verified binding update.');
    }
  }

  async function api(name, resource, paginate = false) {
    const normalized = scope(name);
    if (localOnly) fail('tool-unavailable', 'GitHub reads are skipped in local-only diagnostics.', { reason: 'local-only' });
    if (!authenticated) { await githubAuthentication(); authenticated = true; }
    await confirmRepository(normalized);
    let result;
    try { result = await rawApi(`repos/${normalized}/${resource}${paginate ? '?per_page=100' : ''}`, paginate); }
    catch (error) {
      if (error.code === 'record-unavailable') throw error;
      if (/HTTP 404/.test(String(error.stderr || error.message))) await confirmRepository(normalized);
      githubFailure(error, true);
    }
    if (paginate) {
      if (!Array.isArray(result) || result.some((page) => !Array.isArray(page))) fail('record-unavailable', 'GitHub pagination did not return complete array pages.');
      return result.flat();
    }
    return result;
  }

  async function workRead(work, collection, suffix = '', paginate = false) {
    const ref = workIdentity(work);
    return api(ref.repository, `${collection}/${ref.number}${suffix}`, paginate);
  }

  return {
    repository: bound,
    targetRoot: target,
    localOnly,
    async readBlob(ref) {
      const root = await source(ref);
      const entries = treeEntries(await objectRead(root, ['ls-tree', '-z', ref.revision, '--', ref.path]));
      const file = entries.find((entry) => entry.path === ref.path && entry.type === 'blob');
      if (!file) fail('record-unavailable', 'Reference does not identify a file blob.');
      return objectRead(root, ['cat-file', 'blob', file.sha]);
    },
    async listFiles(ref) {
      const root = await source(ref);
      return treeEntries(await objectRead(root, ['ls-tree', '-r', '-z', ref.revision, '--', ref.path]));
    },
    readIssue: (work) => workRead(work, 'issues'),
    readPull: (work) => workRead(work, 'pulls'),
    listComments: (work) => workRead(work, 'issues', '/comments', true),
    listChildren: (work) => workRead(work, 'issues', '/sub_issues', true),
    listPullFiles: (work) => workRead(work, 'pulls', '/files', true),
    async readParent(work) {
      try { return await workRead(work, 'issues', '/parent'); }
      catch (error) { if (error.code === 'record-unavailable') return null; throw error; }
    },
    readComment(ref) {
      if (!validateRecord('commentRef', ref).valid) fail('binding-invalid', 'Expected a structured comment reference.');
      return api(ref.repository, `issues/comments/${ref.comment_id}`);
    },
  };
}

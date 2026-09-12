import { makeConfig } from '../adoption/helpers.js';
import { commentSource, gitSource, ref, repository, sha256, verificationRecord, wrap } from './records.mjs';

export const blobKey = ({ repository, revision, path }) => `${repository.toLowerCase()}@${revision}:${path}`;
export const commentKey = ({ repository, comment_id }) => `${repository.toLowerCase()}#${comment_id}`;
export const codedError = (code, reason) => Object.assign(new Error(`${code}: ${reason}`), { code, details: { reason } });

// A synthetic source store with explicit immutable Git identities. No live
// consumer history, owner account or toolkit provenance is consulted.
export function scenario() {
  const verification = verificationRecord();
  const config = makeConfig({ name: 'assuredloop-base', version: '0.1.0',
    contracts_path: 'contracts', source_ref: ref('f'.repeat(40), 'openspec/specs') }, { repository });
  config.project.bootstrap = {
    policy_ref: ref('e'.repeat(40), 'policy/bootstrap.md'),
    policy_acceptance: { repository, comment_id: 401 },
    proposal_acceptance: { repository, comment_id: 402 }, authorized_by: 'synthetic-owner',
  };
  const comments = new Map();
  const texts = [
    'Synthetic owner accepts the fixed policy example/bootstrap-consumer@' + 'e'.repeat(40) + ':policy/bootstrap.md and exact delivered bootstrap binding.',
    'Synthetic owner accepts Proposal scope: initial bootstrap planning tasks 1.1 and 1.2.',
    'Original producer original-builder; independent reviewer original-reviewer. Full-scope pass for reviewed head ' + verification.head + ', tasks 1.1 and 1.2. Fixed-policy acceptance and assigned coverage assessed.',
    'Actual bootstrap squash ' + verification.merge_sha + ', parent ' + verification.base_sha + ', reviewed head ' + verification.head + '. Tasks 1.1 and 1.2 delivered.',
  ];
  texts.forEach((text, index) => {
    const source = verification.sources[index].source;
    const body = `${text}\r\nπ e\u0301\r\n`;
    comments.set(commentKey(source), { id: source.comment_id, body, body_text: 'not the raw representation' });
    verification.sources[index].content_sha256 = sha256(Buffer.from(body, 'utf8'));
  });
  const blobs = new Map();
  const put = (value, bytes) => blobs.set(blobKey(value), Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  const configBytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  put(verification.bootstrap_ref, configBytes);
  put(ref(verification.head, '.assuredloop/config.json'), configBytes);
  put(config.project.bootstrap.policy_ref, '# Fixed initial policy\n\nIndependent review and explicit owner acceptance.\n');
  put(verification.verification_policy_ref, '# Accepted later verification policy\n');
  const commits = new Map([
    [verification.base_sha, { sha: verification.base_sha, tree: { sha: '1'.repeat(40) }, parents: [{ sha: '0'.repeat(40) }] }],
    [verification.head, { sha: verification.head, tree: { sha: '2'.repeat(40) }, parents: [{ sha: verification.base_sha }] }],
    [verification.merge_sha, { sha: verification.merge_sha, tree: { sha: '2'.repeat(40) }, parents: [{ sha: verification.base_sha }] }],
  ]);
  const pull = { number: 4, merged: true, state: 'closed', merged_at: '2026-09-11T18:00:00Z',
    merge_commit_sha: verification.merge_sha,
    head: { sha: verification.head, repo: { full_name: repository } },
    // GitHub's post-merge base can advance; historical absence uses squash parent.
    base: { ref: 'main', sha: '9'.repeat(40), repo: { full_name: repository } } };
  const verificationPolicy = { status: 'available', mode: 'activation',
    policy_ref: structuredClone(verification.verification_policy_ref), config: structuredClone(config) };
  const allowed = new Set([repository]);
  const calls = [];
  function recordCall(method, value) {
    const name = typeof value === 'string' ? value.split('#')[0].toLowerCase() : value.repository.toLowerCase();
    calls.push({ method, value: structuredClone(value) });
    if (!allowed.has(name)) throw codedError('reference-out-of-scope', 'current-acquisition-ceiling');
  }
  const adapter = {
    async readPull(value) {
      recordCall('readPull', value);
      if (value.toLowerCase() !== verification.pr.toLowerCase()) throw codedError('record-unavailable', 'not-found');
      return structuredClone(pull);
    },
    async readCommit(value) {
      recordCall('readCommit', value);
      const commit = commits.get(value.revision);
      if (!commit) throw codedError('record-unavailable', 'git-object-unavailable');
      if (commit instanceof Error) throw commit;
      return structuredClone(commit);
    },
    async readBlob(value) {
      recordCall('readBlob', value);
      const bytes = blobs.get(blobKey(value));
      if (bytes instanceof Error) throw bytes;
      if (bytes !== undefined) return Buffer.from(bytes);
      if (!commits.has(value.revision)) throw codedError('record-unavailable', 'git-object-unavailable');
      throw codedError('record-unavailable', 'path-missing');
    },
    async listFiles(value) {
      recordCall('listFiles', value);
      if (!commits.has(value.revision)) throw codedError('record-unavailable', 'git-object-unavailable');
      return [...blobs.keys()].filter((key) => key.startsWith(`${value.repository}@${value.revision}:`))
        .map((key) => ({ path: key.split(':').slice(1).join(':'), type: 'blob', mode: '100644', sha: '3'.repeat(40) }))
        .filter((entry) => value.path === '.' || entry.path === value.path || entry.path.startsWith(`${value.path}/`));
    },
    async readComment(value) {
      recordCall('readComment', value);
      const comment = comments.get(commentKey(value));
      if (!comment) throw codedError('record-unavailable', 'not-found');
      if (comment instanceof Error) throw comment;
      return structuredClone(comment);
    },
  };
  const laterSource = commentSource(405);
  const row = { issues: [`${repository}#2`], prs: [verification.pr], reviewed_head: verification.head,
    base_ref: verification.base_ref, base_sha: verification.base_sha, policy_ref: null, policy_mode: null,
    result: verification.result, scope: verification.scope,
    source: structuredClone(verification.sources[3].source), content_sha256: verification.sources[3].content_sha256,
    initial_bootstrap: { verification, source: laterSource, content_sha256: '' } };
  function refreshLater() {
    const body = `${wrap(verification)}\r\nLater independent assessment; semantic owner authority and original review still require judgment.\n`;
    comments.set(commentKey(laterSource), { id: laterSource.comment_id, body });
    row.initial_bootstrap.content_sha256 = sha256(Buffer.from(body, 'utf8'));
  }
  refreshLater();
  const closeoutPolicyRef = ref('8'.repeat(40), 'policy/aggregate-closeout.md');
  const manifest = () => ({ schema_version: 1, captured_at: '2026-09-12T19:00:00Z',
    closeout_policy_ref: closeoutPolicyRef, deliveries: [structuredClone(row)], decisions: [] });
  return { adapter, calls, allowed, verification, verificationPolicy, config, configBytes, pull, commits,
    blobs, comments, row, closeoutPolicyRef, put, refreshLater, manifest, laterSource,
    captureArgs() { return { adapter, verificationPolicy, closeoutPolicyRef,
      capturedAt: '2026-09-12T19:00:00Z', deliveries: [structuredClone(row)] }; },
    checkArgs() { return { adapter, verificationPolicy, manifest: manifest() }; },
    useGitOriginal(index = 2) {
      const item = verification.sources[index];
      const bytes = Buffer.from(comments.get(commentKey(item.source)).body, 'utf8');
      item.source = gitSource(ref('e'.repeat(40), 'reports/original-review.md'));
      put(item.source.ref, bytes); refreshLater();
    },
  };
}

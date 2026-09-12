import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fail } from './files.js';
import { validateRecord, collectRecordReferences } from './records.js';
import { workIdentity } from './read-adapter.js';
import { checkReviewerEligibility } from './policy.js';
import { sourceBytes } from './source-bytes.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

// Eligibility establishes observed history and source consistency, not the
// authority or meaning of the original approval and review prose.
export async function verifyInitialBootstrap({ adapter, record, verificationPolicy } = {}) {
  if (!validateRecord('initialBootstrapVerification', record).valid) fail('initial-bootstrap-invalid', 'Invalid initial-bootstrap verification record.');
  if (verificationPolicy?.status !== 'available' || !isDeepStrictEqual(record.verification_policy_ref, verificationPolicy.policy_ref)) fail('initial-bootstrap-policy-unavailable', 'Verification requires the invoking accepted current policy.');
  const review = checkReviewerEligibility({ record, policy: verificationPolicy, reviewKind: 'internal' });
  if (record.result !== 'pass' || review.some((item) => item.severity !== 'review')) fail('initial-bootstrap-review-invalid', 'A passing independent eligible later review is required.', review);
  const configRepository = verificationPolicy.config.repository;
  const allowed = new Set([configRepository.name, ...(configRepository.allowed_reference_repositories || [])].map((name) => name.toLowerCase()));
  const authorize = (ref) => {
    const name = typeof ref === 'string' ? workIdentity(ref).repository : ref.repository?.toLowerCase();
    if (!allowed.has(name)) fail('reference-out-of-scope', 'Bootstrap evidence is outside the invoking current permission ceiling.');
  };
  for (const ref of collectRecordReferences(record)) authorize(ref);
  const { repository, number } = workIdentity(record.pr);
  const pull = await adapter.readPull(record.pr);
  if (pull?.number !== number || pull.base?.repo?.full_name?.toLowerCase() !== repository || pull.head?.sha !== record.head || pull.base?.ref !== record.base_ref) fail('initial-bootstrap-tuple-mismatch', 'Initial delivery PR identity/head/destination differs from the verification.');
  if (pull.merged !== true || !Number.isFinite(Date.parse(pull.merged_at)) || pull.merge_commit_sha !== record.merge_sha || Date.parse(record.verified_at) < Date.parse(pull.merged_at)) fail('initial-bootstrap-delivery-invalid', 'Verification requires the actual prior merged delivery.');
  const commits = [];
  for (const revision of [record.base_sha, record.head, record.merge_sha]) {
    const commit = await adapter.readCommit({ repository, revision });
    if (commit?.sha !== revision || !validateRecord('sha', commit.tree?.sha).valid || !Array.isArray(commit.parents) || commit.parents.some((parent) => !validateRecord('sha', parent.sha).valid)) fail('initial-bootstrap-commit-invalid', 'The fixed commit identity/tree/parents are unavailable.');
    commits.push(commit);
  }
  const [, head, merge] = commits;
  if (merge.parents.length !== 1 || merge.parents[0].sha !== record.base_sha || merge.tree.sha !== head.tree.sha) fail('initial-bootstrap-merge-unsupported', 'Initial verification supports a squash with the recorded sole parent and reviewed tree.');
  for (const path of ['.assuredloop/config.json', '.assuredloop/activation.json']) {
    let absent = false;
    try { await adapter.readBlob({ repository, revision: record.base_sha, path }); }
    catch (error) {
      if (error.code !== 'record-unavailable' || error.details?.reason !== 'path-missing') throw error;
      absent = true;
    }
    if (!absent) fail('initial-bootstrap-policy-present', `Initial base already contains ${path}; invalid or suspended data is not absence.`);
  }
  const expectedRef = { repository, revision: record.merge_sha, path: '.assuredloop/config.json' };
  if (!isDeepStrictEqual({ ...record.bootstrap_ref, repository: record.bootstrap_ref.repository.toLowerCase() }, expectedRef)) fail('initial-bootstrap-config-mismatch', 'Bootstrap config must select the actual delivered fixed configuration.');
  const bytes = await adapter.readBlob(record.bootstrap_ref);
  const reviewed = await adapter.readBlob({ ...expectedRef, revision: record.head });
  if (!Buffer.isBuffer(bytes) || !Buffer.isBuffer(reviewed) || !bytes.equals(reviewed)) fail('initial-bootstrap-config-mismatch', 'Delivered config bytes differ from the reviewed contribution.');
  const config = JSON.parse(decode(bytes));
  if (!validateRecord('config', config).valid || config.repository.name.toLowerCase() !== repository || !config.project.bootstrap) fail('initial-bootstrap-config-invalid', 'Delivered configuration lacks a valid fixed bootstrap binding.');
  const bootstrap = config.project.bootstrap;
  authorize(bootstrap.policy_ref);
  await adapter.readBlob(bootstrap.policy_ref);
  const sourceRef = (source) => source.kind === 'git-blob' ? source.ref : { repository: source.repository, comment_id: source.comment_id };
  for (const [purpose, acceptance] of [['policy-acceptance', bootstrap.policy_acceptance], ['proposal-acceptance', bootstrap.proposal_acceptance]]) {
    if (!record.sources.some((item) => item.purpose === purpose && isDeepStrictEqual(sourceRef(item.source), acceptance))) fail('initial-bootstrap-acceptance-mismatch', `Original ${purpose} source differs from the delivered bootstrap reference.`);
  }
  for (const item of record.sources) {
    const original = await sourceBytes(adapter, item.source);
    if (hash(original) !== item.content_sha256) fail('evidence-drift', `Original ${item.purpose} bytes differ from the verification digest.`);
  }
  return { valid: true, findings: [{ code: 'initial-bootstrap-semantic-review-required', severity: 'review',
    message: 'Initial absence, squash identity and source fixity were checked. Actual fixed-policy approval, original reviewer independence and complete contribution coverage remain semantic review obligations.' }] };
}

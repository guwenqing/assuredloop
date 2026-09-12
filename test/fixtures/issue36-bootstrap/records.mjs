import { createHash } from 'node:crypto';

export const repository = 'example/bootstrap-consumer';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const ref = (revision, path) => ({ repository, revision, path });
export const commentSource = (comment_id, name = repository) => ({
  kind: 'github-issue-comment', repository: name, comment_id,
  endpoint: 'GET /repos/{owner}/{repo}/issues/comments/{id}', api_version: '2022-11-28',
  media_type: 'application/vnd.github.raw+json', field: 'body', encoding: 'utf-8', normalization: 'none',
});
export const gitSource = (value) => ({ kind: 'git-blob', representation: 'raw-bytes', ref: value });
export const wrap = (record) => `## Workflow context\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
export const purposes = ['policy-acceptance', 'proposal-acceptance', 'review', 'delivery'];

export function verificationRecord() {
  return {
    record_type: 'initial-bootstrap-verification',
    pr: `${repository}#4`, head: 'a'.repeat(40), base_ref: 'main', base_sha: 'b'.repeat(40),
    merge_sha: 'c'.repeat(40), bootstrap_ref: ref('c'.repeat(40), '.assuredloop/config.json'),
    sources: purposes.map((purpose, index) => ({
      purpose, source: commentSource(401 + index), content_sha256: sha256(`${purpose}\r\nπ e\u0301\n`),
    })),
    verified_at: '2026-09-12T18:00:00Z',
    verification_policy_ref: ref('d'.repeat(40), 'policy/current.md'),
    scope: 'Initial bootstrap planning contribution, tasks 1.1 and 1.2.', result: 'pass',
    producer_session: 'later-assessment-producer', reviewer_session: 'later-independent-reviewer',
    reviewer_model: 'gpt-6-astra', review_depth: 'full-scope',
  };
}

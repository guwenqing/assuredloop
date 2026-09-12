import { validateRecord } from './records.js';
import { checkEvidenceContext } from './policy.js';

// Applicability is relative to trusted PR/policy acquisition, never comment order.
// The original record and verdict remain in source context even when excluded.
export function reviewEvidenceApplicability({ entry, pr, pull, policy, current }) {
  const { record } = entry;
  const result = { source: entry.ref, pr, applicability: 'current', findings: [] };
  if (!validateRecord('evidence', record).valid || record.pr?.toLowerCase() !== pr.toLowerCase()) {
    return { ...result, applicability: 'invalid', findings: [{ code: 'evidence-identity-invalid', message: 'Evidence must be a valid ordinary record for this actual PR.' }] };
  }
  const differences = current
    ? checkEvidenceContext({ record, policy, current })
    : ['head', 'base_ref', ...(!pull.merged ? ['base_sha'] : [])].filter((field) =>
      record[field] !== ({ head: pull.head.sha, base_ref: pull.base.ref, base_sha: pull.base.sha })[field])
      .map((field) => ({ code: 'evidence-tuple-stale', message: `Recorded ${field} differs from the actual PR assessment.` }));
  if (differences.length) {
    result.applicability = 'noncurrent';
    result.findings = differences.map((finding) => ({ ...finding, severity: 'review' }));
    result.findings.push({ code: 'review-history-retained', severity: 'review',
      message: 'Noncurrent evidence supplies no acceptance credit. Its original verdict and findings remain unresolved context until explicitly dispositioned and independently reassessed; exclusion does not resolve them.' });
  }
  return result;
}

import { validateRecord, hasReviewDeclarations } from './records.js';
import { reviewRouting } from './native.js';
import { checkReviewEvidence } from './policy.js';

export async function checkReviewObligations({ entries, policy, current }) {
  const routing = policy.review_routing ?? (policy.status === 'available' ? await reviewRouting(policy.config) : null);
  const result = { pr: current.pr, head: current.head, base_sha: current.base_sha,
    primary_tool: routing?.primary_tool, additional: routing?.additional,
    status: 'unavailable', qualified: { internal: [], external: [] }, findings: [] };
  if (policy.status !== 'available' || !routing || ['invalid', 'unavailable'].includes(routing.status)) {
    result.findings.push(...(routing?.findings || policy.findings));
    return result;
  }
  if (routing.status === 'not-configured') {
    return { pr: current.pr, status: 'not-configured' };
  }
  const candidates = { internal: [], external: [] };
  for (const entry of entries) {
    const record = entry.record;
    // The distinct later bootstrap verification has its own validated history
    // path. It never supplies an ordinary current-PR routing obligation.
    if (!validateRecord('evidence', record).valid || !hasReviewDeclarations(record)) continue;
    const findings = checkReviewEvidence({ record, policy, current });
    if (record.result !== 'pass') findings.push({ code: 'review-result-not-passing', message: 'Only a passing assessment can discharge a review obligation.' });
    if (record.review_tool && !routing.supported_tools.includes(record.review_tool)) findings.push({ code: 'review-tool-unsupported',
      message: `Unsupported native review tool: ${record.review_tool}` });
    result.findings.push(...findings.map((finding) => ({ ...finding, source: entry.ref })));
    if (findings.some((finding) => finding.severity !== 'review')) continue;
    candidates[record.review_kind].push({ source: entry.ref, reviewer_session: record.reviewer_session,
      reviewer_model: record.reviewer_model, review_tool: record.review_tool });
  }
  const sessions = new Set();
  for (const kind of ['internal', 'external']) {
    for (const candidate of candidates[kind]) {
      if (sessions.has(candidate.reviewer_session)) {
        result.findings.push({ code: 'review-session-duplicate', severity: 'review', source: candidate.source,
          message: 'A reviewer session cannot count twice or discharge both primary and additional obligations.' });
        continue;
      }
      sessions.add(candidate.reviewer_session);
      result.qualified[kind].push(candidate);
    }
  }
  if (!result.qualified.internal.length) result.findings.push({ code: 'review-primary-missing', message: 'A qualifying primary review is required and missing.' });
  if (routing.additional === 'required' && !result.qualified.external.length) result.findings.push({ code: 'review-additional-missing', message: 'Required independent additional review is missing.' });
  if (routing.additional === 'on-request') result.findings.push({ code: 'review-on-request-semantic-boundary', severity: 'review',
    message: 'Explicit work-specific additional-review requests remain sourced manual handoff obligations; arbitrary prose is not mechanically interpreted.' });
  result.status = result.qualified.internal.length && (routing.additional !== 'required' || result.qualified.external.length) ? 'satisfied' : 'incomplete';
  return result;
}

import { validateRecord } from './records.js';
import { readRecordBody } from './record-body.js';
import { workIdentity } from './read-adapter.js';
import { loadNativeRuntime } from './native-runtime.js';
import { checkAnchor } from './policy.js';
import { checkTaskAssociations } from './task-associations.js';
import { classifyIssue, mappedPullAssignments, withExecutionAssignments } from './classification.js';
export { checkTaskAssociations } from './task-associations.js';

export async function parseWorkRecord({ body, kind, allowMissing = false } = {}) {
  let record = null;
  const findings = [];
  try {
    record = await readRecordBody(body, { allowPlain: ['evidence', 'selfChangeDecision'].includes(kind) });
    const shape = validateRecord(kind === 'roughRequest' ? 'issue' : kind, record);
    if (!shape.valid) findings.push({ code: 'record-schema-invalid', message: 'Workflow record shape is invalid.', details: shape.errors });
  } catch (error) {
    if (!(kind === 'roughRequest' && allowMissing && error.code === 'record-context-missing')) {
      findings.push({ code: error.code || 'record-invalid', message: error.message });
    }
  }
  return { record, findings };
}

const planKey = (ref, item) => `${ref.repository.toLowerCase()}:${ref.path}#${item}`;
const plans = (record) => new Set((record?.plan_items || []).flatMap((ref) => ref.items.map((item) => planKey(ref, item))));

export async function checkWorkRecords({ work, issue, pulls = [], evidence = [], classification, categoryMapping, phase = 'handoff', resolveRef, resolveWork, _stack = [] } = {}) {
  const result = { status: 'valid', findings: [], context: { work, phase, issue: structuredClone(issue), pulls: structuredClone(pulls), evidence: structuredClone(evidence), references: [], prerequisites: [] } };
  const add = (code, message, severity = 'error', details) => {
    result.findings.push({ code, message, severity, details });
    if (severity === 'error') result.status = 'invalid';
    if (severity === 'unavailable' && result.status !== 'invalid') result.status = 'unavailable';
  };
  let identity;
  try { identity = workIdentity(work); work = `${identity.repository}#${identity.number}`; }
  catch (error) { add(error.code, error.message); return result; }
  if (_stack.includes(work)) { add('dependency-cycle', 'Explicit prerequisite references contain a cycle.'); return result; }
  if (issue?.number !== identity.number || (issue.repository_url && issue.repository_url.toLowerCase() !== `https://api.github.com/repos/${identity.repository}`)) {
    add('work-identity-invalid', 'Issue identity differs from the explicitly selected work.'); return result;
  }
  const parsed = await parseWorkRecord({ body: issue.body ?? '', kind: 'issue' });
  classification ??= classifyIssue(issue, parsed.record, categoryMapping);
  classification = withExecutionAssignments(classification, await mappedPullAssignments(work, pulls));
  result.context.classification = structuredClone(classification);
  for (const finding of classification.discrepancies) add(finding.code, finding.message, finding.severity, finding.details);
  if (classification.exception && parsed.findings.every((finding) => finding.code === 'record-context-missing')) return result;
  for (const finding of parsed.findings) add(finding.code, finding.message, 'error', finding.details);
  if (!parsed.record || parsed.findings.length) return result;
  const record = parsed.record;
  result.context.record = record;
  result.context.required_work_refs = [record.request, ...(record.prior_work || [])];
  const native = await loadNativeRuntime();
  const loaded = new Map();
  async function refsOf(value, allowedWorks = [work], sourceWork = work) {
    const memberships = new Map();
    for (const ref of [...(value.basis || []), ...(value.plan_items || [])]) {
      const { items, ...fileRef } = ref;
      const id = `${sourceWork.toLowerCase()}:${JSON.stringify(fileRef)}`;
      try {
        if (!loaded.has(id)) {
          if (typeof resolveRef !== 'function') throw Object.assign(new Error('Reference resolver is unavailable.'), { code: 'record-unavailable' });
          const source = await resolveRef(fileRef, { work: sourceWork });
          if (typeof source?.content !== 'string' && !Buffer.isBuffer(source?.bytes)) throw Object.assign(new Error('Reference content is unavailable.'), { code: 'record-unavailable' });
          if ((fileRef.anchor || items) && typeof source.content !== 'string') throw Object.assign(new Error('A heading anchor or native PlanRef requires text; the acquired source is non-text.'), { code: 'non-text-source' });
          if (typeof source.content === 'string') await checkAnchor(fileRef, source.content);
          loaded.set(id, source);
          result.context.references.push({ ref: fileRef, source_work: sourceWork, content: source.content,
            ...(Buffer.isBuffer(source.bytes) ? { bytes: Buffer.from(source.bytes), disposition: source.disposition, reason: source.reason } : {}) });
        }
        if (items) {
          if (typeof loaded.get(id).content !== 'string') throw Object.assign(new Error('Native PlanRef source is non-text.'), { code: 'non-text-source' });
          const tasks = native.parseTaskLines(loaded.get(id).content);
          const ids = new Set(tasks.map((task) => /^(\d+(?:\.\d+)*)(?:\.)?(?=\s|$)/.exec(task.description)?.[1]).filter(Boolean));
          for (const item of items) if (!ids.has(item)) add('plan-item-missing', `Referenced native task ${item} does not exist.`, 'error', ref);
          const association = await checkTaskAssociations({ content: loaded.get(id).content, planRef: ref, allowedWorks,
            allowUnresolved: phase === 'planning' && record.activity === 'plan' && issue.state === 'open' });
          result.context.task_associations ??= [];
          result.context.task_associations.push({ ref, ...association });
          for (const item of association.associations) if (item.verified) memberships.set(planKey(ref, item.item), item.owners[0]);
          for (const finding of association.findings) add(finding.code, finding.message, finding.severity, { ref, source_work: sourceWork });
        }
      } catch (error) {
        add('reference-unavailable', `${phase}: ${error.message}`, 'unavailable', { ref, source_work: sourceWork, cause: error.code });
      }
    }
    return memberships;
  }
  await refsOf(record);
  const cancelled = issue.state === 'closed' && issue.state_reason === 'not_planned';
  if (cancelled) {
    add('cancellation-not-delivery', 'Cancellation is not delivery credit. Its actual explanation/rationale remains subject to semantic assessment; state_reason alone does not justify it.', 'review');
    return result;
  }

  const assigned = plans(record);
  const contributions = new Set();
  const unverifiedContributions = new Set();
  const pullRecords = new Map();
  for (const pull of pulls) {
    const pr = `${identity.repository}#${pull.number}`;
    if (!validateRecord('work', pr).valid || pull.base?.repo?.full_name?.toLowerCase() !== identity.repository || !validateRecord('sha', pull.head?.sha).valid) {
      add('pr-identity-invalid', 'Referenced PR metadata has invalid identity, destination or head.'); continue;
    }
    const parsedPull = await parseWorkRecord({ body: pull.body, kind: 'pr' });
    for (const finding of parsedPull.findings) add(finding.code, finding.message, 'error', { pr, details: finding.details });
    if (!parsedPull.record || parsedPull.findings.length) continue;
    const prRecord = parsedPull.record;
    if (!prRecord.issues.some((item) => item.toLowerCase() === work)) add('pr-issue-mismatch', 'Referenced PR is unrelated to this Issue mapping.', 'error', { pr });
    const memberships = await refsOf(prRecord, prRecord.issues, pr);
    for (const item of plans(prRecord)) {
      const owner = memberships.get(item);
      if (!owner) unverifiedContributions.add(item);
      if (owner && owner !== work.toLowerCase()) continue;
      if (assigned.size && !assigned.has(item)) add('plan-mapping-invalid', 'PR claims a task outside the explicit Issue assignment.', 'error', { pr, item });
      if (owner === work.toLowerCase() && pull.merged && pull.merged_at && validateRecord('sha', pull.merge_commit_sha).valid) contributions.add(item);
    }
    pullRecords.set(pr, { pull, record: prRecord });
  }

  const reviewed = new Set();
  for (const entry of evidence) {
    if (!validateRecord('evidenceRef', entry.ref).valid) add('evidence-source-invalid', 'Evidence source identity is invalid.');
    const assessment = entry.record;
    const shape = validateRecord('evidence', assessment);
    if (!shape.valid) { add('evidence-record-invalid', 'Evidence record shape is invalid.', 'error', shape.errors); continue; }
    if (assessment.reviewer_model !== undefined || assessment.reviewer_session !== undefined) {
      if (!assessment.producer_session || !assessment.reviewer_session || assessment.producer_session === assessment.reviewer_session) {
        add('review-independence-invalid', 'Review must declare distinct nonempty producer and reviewer sessions.');
      }
      if (assessment.review_depth !== 'full-scope') add('review-depth-invalid', 'Review must declare full-scope depth.');
    }
    if (assessment.pr) {
      const match = pullRecords.get(assessment.pr.toLowerCase());
      if (!match) { add('evidence-pr-mismatch', 'Evidence identifies an unrelated or unavailable PR.'); continue; }
      const { pull } = match;
      if (assessment.head !== pull.head.sha || assessment.base_ref !== pull.base.ref || (!pull.merged && assessment.base_sha !== pull.base.sha)) {
        add('evidence-tuple-stale', 'Evidence does not match the PR head/destination assessment.');
      }
      if (assessment.reviewer_session && assessment.producer_session && assessment.reviewer_session !== assessment.producer_session && assessment.review_depth === 'full-scope') reviewed.add(assessment.pr.toLowerCase());
    }
  }
  const closed = issue.state === 'closed' && issue.state_reason !== 'not_planned';
  if (closed && ['deliver', 'plan', 'closeout'].includes(record.activity)) {
    const merged = [...pullRecords.entries()].filter(([, { pull }]) => pull.merged && pull.merged_at && validateRecord('sha', pull.merge_commit_sha).valid);
    if (!merged.length) add('delivery-unsupported', 'A completed delivery needs an actual merged PR and resulting merge commit.');
    for (const [pr] of merged) if (!reviewed.has(pr)) add('delivery-review-missing', 'Required scoped review evidence is missing for a delivered PR.', 'error', { pr });
    for (const item of assigned) if (!contributions.has(item)) {
      if (unverifiedContributions.has(item)) add('delivery-plan-unverified', 'Canonical assignment for a claimed contribution could not be verified.', 'unavailable', { item });
      else add('delivery-plan-uncovered', 'Completed Issue lacks a mapped merged contribution for an assigned task.', 'error', { item });
    }
  }
  if ((closed || phase === 'closeout') && !evidence.length) add('evidence-missing', 'Required verification/review evidence is missing.');
  if (record.activity === 'research') add('research-review-required', 'Research findings, limits and their review require semantic assessment; no implementation delivery is inferred.', 'review');

  if (!(phase === 'planning' && record.activity === 'plan')) {
    for (const declaredDependency of record.depends_on || []) {
      const dependency = declaredDependency.toLowerCase();
      if (typeof resolveWork !== 'function') { add('prerequisite-unavailable', 'Prerequisite source resolver is unavailable.', 'unavailable', { dependency }); continue; }
      try {
        const bundle = await resolveWork(dependency);
        result.context.prerequisites.push({ work: dependency, ...structuredClone(bundle) });
        if (bundle?.issue?.state !== 'closed' || bundle.issue.state_reason !== 'completed') {
          add('prerequisite-undelivered', 'Explicit prerequisite is open, cancelled or not completed.', 'error', { dependency }); continue;
        }
        const checked = await checkWorkRecords({ work: dependency,
          ...(workIdentity(dependency).repository === identity.repository ? { categoryMapping } : {}),
          ...bundle, phase: 'closeout', resolveRef, resolveWork, _stack: [..._stack, work] });
        if (checked.status !== 'valid') add('prerequisite-unverified', 'Prerequisite delivery lacks required formal evidence.', checked.status === 'unavailable' ? 'unavailable' : 'error', { dependency, findings: checked.findings });
      } catch (error) { add('prerequisite-unavailable', error.message, 'unavailable', { dependency, cause: error.code }); }
    }
  }
  add('semantic-delivery-review-required', 'Formal links/state/record checks do not prove the whole assigned or wider outcome. Review the preserved assignment, plan, evidence scope and actual destination/result; no merge permission is granted.', 'review');
  return result;
}

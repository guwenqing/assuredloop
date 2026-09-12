import { git } from './files.js';
import { createReadAdapter, workIdentity } from './read-adapter.js';
import { createTrace, currentTracePolicy, closeoutContext, publicBundle, structuredBody, recordReferences } from './trace.js';
import { validateRecord, hasReviewDeclarations } from './records.js';
import { checkWorkRecords, parseWorkRecord } from './work-records.js';
import { resolvePolicy, resolveHistoricalPolicy, checkReviewEvidence, checkEvidenceContext } from './policy.js';
import { isDeepStrictEqual } from 'node:util';
import { verifyInitialBootstrap } from './initial-bootstrap.js';
import { runtimeContext } from './runtime.js';
import { checkReviewObligations } from './review-routing.js';

async function liveCheck({ targetRoot, work, deltaRef, manifestRef, runtime }) {
  const result = { ...runtimeContext(runtime), operation: 'check', mode: 'live', status: 'pass', work, findings: [], policies: [], records: [] };
  let trace;
  const add = (code, message, status = 'invalid', details) => {
    result.findings.push({ code, message, details });
    if (status === 'invalid' || result.status === 'pass') result.status = status;
  };
  const acquisitionFailure = (error) => {
    if (error.code !== 'secondary-acquisition-unavailable') throw error;
    add(error.code, error.message, 'unavailable', error.details);
    result.policies.push({ status: 'unavailable', assessment: { pr: error.details.work }, sources: [],
      findings: [{ code: error.code, message: error.message, details: error.details }] });
  };
  try {
    trace = await createTrace({ targetRoot, work, runtime });
    const selected = await trace.bundleAt(work);
    result.repository = trace.repository;
    result.context = publicBundle(selected);
    result.context.evidence = selected.evidence.map(({ ref, record }) => ({ source: ref, record }));
    result.review_routing = [];
    result.context.acquisition = trace.acquisitionContext();
    const verifyBootstrap = async (entry) => {
      const policy = result.policy?.status === 'available' ? result.policy : await currentTracePolicy(trace);
      return verifyInitialBootstrap({ adapter: trace.adapter, record: entry.record, verificationPolicy: policy });
    };
    const verifyEvidence = async (entry) => {
      const pull = await trace.pullAt(entry.record.pr);
      return trace.withPolicyScope(pull, async () => {
        const policy = await resolveHistoricalPolicy({ adapter: trace.adapter, record: entry.record, runtime });
        const findings = [...policy.findings];
        if (policy.status !== 'available') return { valid: false, findings };
        const { repository } = workIdentity(entry.record.pr);
        const merge = await trace.adapter.readCommit({ repository, revision: pull.merge_commit_sha });
        await trace.adapter.readCommit({ repository, revision: entry.record.head });
        if (!merge.parents.length) return { valid: false, findings: [{ code: 'historical-merge-mismatch', message: 'Actual delivered commit has no integration parent.' }] };
        // Ordinary reviewed PRs can merge after a separately assessed destination
        // advance. Retain that distinction; only initial bootstrap requires the
        // exact recorded sole parent and whole reviewed tree.
        if (merge.parents[0].sha !== entry.record.base_sha) findings.push({ code: 'historical-integration-review-required', severity: 'review',
          message: 'The actual integration parent differs from the recorded review base. Review the explicit freshness/disposition and delivered contribution; historical audit fields remain unchanged.',
          details: { recorded_base_sha: entry.record.base_sha, integration_parent_sha: merge.parents[0].sha, merge_sha: merge.sha } });
        const current = { ...policy.assessment, policy_ref: policy.policy_ref, contract_package: policy.contract_package,
          config_digest: policy.config_digest, activation_digest: policy.activation_digest };
        const assessment = (hasReviewDeclarations(entry.record) ? checkReviewEvidence : checkEvidenceContext)({ record: entry.record, policy, current });
        for (const ref of entry.record.evidence) await trace.load(ref);
        return { valid: assessment.every((finding) => finding.severity === 'review'), findings: [...findings, ...assessment] };
      });
    };
    if (!selected.pulls.length) {
      const policy = await currentTracePolicy(trace);
      result.policy = policy;
      result.policies.push(policy);
      result.context.current = policy.current;
      result.findings.push(...policy.findings);
      if (policy.status !== 'available') add('current-policy-unavailable', 'Required current policy context could not be established.', policy.status === 'invalid' ? 'invalid' : 'unavailable');
      trace.cacheSources(policy.sources || []);
      for (const entry of selected.evidence) {
        if (entry.record.head !== null) {
          try { await trace.adapter.listFiles({ repository: trace.repository, revision: entry.record.head, path: '.' }); }
          catch (error) { add('evidence-source-unavailable', 'The recorded non-PR head is unavailable in the bound repository.', 'unavailable', { head: entry.record.head, cause: error.code, details: error.details }); }
        }
        const declarations = (hasReviewDeclarations(entry.record) ? checkReviewEvidence : checkEvidenceContext)({ record: entry.record, policy, current: { head: entry.record.head } });
        for (const finding of declarations) {
          if (finding.severity === 'review') result.findings.push({ ...finding, context: 'current-policy-comparison' });
          else add(`current-${finding.code}`, `Current policy comparison: ${finding.message}`, finding.code === 'review-policy-unavailable' ? 'unavailable' : 'invalid');
        }
        for (const ref of entry.record.evidence) {
          try { await trace.load(ref); }
          catch (error) { add('evidence-source-unavailable', error.message, 'unavailable', { ref, cause: error.code }); }
        }
      }
      if (selected.evidence.length) result.findings.push({ code: 'non-pr-audit-not-recorded', message: 'Prior policy provenance was not recorded in this non-PR evidence. Current comparison cannot determine past compliance; the original evidence is retained unchanged.' });
    }
    for (const pull of selected.pulls) {
      const pr = `${trace.repository}#${pull.number}`;
      const assessments = selected.evidence.filter((entry) => entry.record.pr?.toLowerCase() === pr);
      const routingPolicies = new Map();
      if (!assessments.some((entry) => hasReviewDeclarations(entry.record))) add('review-evidence-missing', `${pr} has no structured review assessment evidence.`);
      for (const entry of assessments.length ? assessments : [null]) {
        if (entry?.record.record_type === 'initial-bootstrap-verification') {
          const verified = await verifyBootstrap(entry);
          result.findings.push(...verified.findings);
          continue;
        }
        const historical = pull.merged === true && entry;
        try {
          await trace.bindPolicyScope(pull);
          const policy = historical
            ? await resolveHistoricalPolicy({ adapter: trace.adapter, record: entry.record, runtime })
            : await resolvePolicy({ adapter: trace.adapter, work: pr, runtime });
          result.policies.push(policy);
          routingPolicies.set(JSON.stringify([policy.assessment, policy.config_digest, policy.activation_digest]), policy);
          result.policy ??= policy;
          result.assessment ??= policy.assessment;
          result.findings.push(...policy.findings);
          if (policy.status !== 'available') { add('policy-unavailable', `${pr}: required policy could not be established.`, policy.status === 'invalid' ? 'invalid' : 'unavailable'); continue; }
          trace.cacheSources(policy.sources);
          const current = { ...policy.assessment, policy_ref: policy.policy_ref, contract_package: policy.contract_package,
            config_digest: policy.config_digest, activation_digest: policy.activation_digest };
          if (!historical) {
            const observed = await trace.adapter.readBranchHead({ repository: trace.repository, branch: pull.base.ref });
            if (observed !== policy.assessment.base_sha) add('destination-base-stale', `${pr}: the remote destination branch advanced after the assessed base.`, 'invalid', { assessed: policy.assessment.base_sha, observed });
            if (policy.assessment.head !== pull.head.sha || policy.assessment.base_sha !== pull.base.sha || policy.assessment.base_ref !== pull.base.ref) add('assessment-context-stale', `${pr}: PR identity changed while policy was read.`);
          }
          if (entry) {
            for (const finding of (hasReviewDeclarations(entry.record) ? checkReviewEvidence : checkEvidenceContext)({ record: entry.record, policy, current })) {
              if (finding.severity === 'review') result.findings.push(finding);
              else add(finding.code, finding.message);
            }
            for (const ref of entry.record.evidence) {
              try { await trace.load(ref); }
              catch (error) { add('evidence-source-unavailable', error.message, 'unavailable', { ref, cause: error.code }); }
            }
          }
        } catch (error) { acquisitionFailure(error); }
        finally { trace.resetScope(); }
      }
      // A specialized verification alone still cannot bypass ordinary PR review.
      if (!routingPolicies.size && !pull.merged) {
        const policy = await trace.withPolicyScope(pull, () => resolvePolicy({ adapter: trace.adapter, work: pr, runtime }));
        routingPolicies.set(pr, policy);
      }
      for (const policy of routingPolicies.values()) {
        const current = { pr, head: pull.head.sha, base_sha: pull.base.sha, ...policy.assessment,
          policy_ref: policy.policy_ref, contract_package: policy.contract_package,
          config_digest: policy.config_digest, activation_digest: policy.activation_digest };
        const routing = await checkReviewObligations({ entries: assessments, policy, current });
        result.review_routing.push(routing);
        if (routing.status === 'incomplete') add('review-obligations-incomplete', `${pr}: required review obligations are incomplete.`);
        else if (routing.status === 'unavailable') add('review-routing-unavailable', `${pr}: review routing could not be established.`, 'unavailable');
      }
    }
    const record = await structuredBody(selected.issue.body, { allowPlain: false });
    const issueRefs = selected.issue.pull_request ? (validateRecord('pr', record).valid ? record.issues : []) : [work];
    if (selected.issue.pull_request && !issueRefs.length) add('pr-record-invalid', 'Selected PR has no valid structured Issue mapping.');
    for (const issueRef of issueRefs) {
      const bundle = issueRef === work ? selected : await trace.bundleAt(issueRef);
      if (bundle.classification?.exception) {
        const intake = await parseWorkRecord({ body: bundle.issue.body ?? '', kind: 'roughRequest', allowMissing: true });
        result.records.push({ ...intake, context: { issue: bundle.issue, evidence: bundle.evidence, classification: bundle.classification } });
        for (const finding of intake.findings) add(finding.code, finding.message);
        if (bundle.classification.exception === 'rough-request') {
          if (result.status === 'pass') result.status = 'incomplete';
          result.findings.push({ code: 'rough-intake-context', message: 'Open rough intake has no routed work record; current policy is inspection context, not task acceptance.' });
        }
        continue;
      }
      const parsed = await parseWorkRecord({ body: bundle.issue.body, kind: 'issue' });
      for (const ref of recordReferences(parsed.record, { runtime })) {
        try { await trace.load(ref); }
        catch (error) { add('reference-unavailable', error.message, 'unavailable', { ref, cause: error.code }); }
      }
      const checked = await checkWorkRecords({ work: issueRef, ...bundle, phase: parsed.record?.activity === 'closeout' ? 'closeout' : 'handoff', resolveRef: trace.loadForWork, resolveWork: trace.bundleAt, verifyBootstrap, verifyEvidence });
      checked.work = issueRef;
      result.records.push(checked);
      for (const finding of checked.findings) {
        if (finding.severity === 'review') result.findings.push(finding);
        else add(finding.code, finding.message, finding.severity === 'unavailable' ? 'unavailable' : 'invalid', finding.details);
      }
    }
    const closeout = await closeoutContext({ trace, bundle: selected, policies: result.policies, deltaRef, manifestRef });
    if (closeout) {
      result.synchronization = closeout.synchronization;
      result.manifest = closeout.manifest;
      result.context.native = closeout.native;
      for (const finding of closeout.inventoryFindings) add(finding.code, finding.message);
      result.findings.push(...closeout.manifest.findings.filter((finding) => finding.severity === 'review'));
      if (closeout.synchronization.status !== 'valid') add('synchronization-incomplete', 'Native synchronization checks did not establish full coverage.', closeout.synchronization.status === 'invalid' ? 'invalid' : 'unavailable', closeout.synchronization.findings);
      if (!closeout.manifest.valid) add('manifest-invalid', 'Acceptance manifest verification did not pass.', 'invalid', closeout.manifest.findings);
      for (const dependency of closeout.record.depends_on || []) {
        const bundle = await trace.bundleAt(dependency);
        const checked = await checkWorkRecords({ work: dependency, ...bundle, phase: 'closeout', resolveRef: trace.loadForWork, resolveWork: trace.bundleAt, verifyBootstrap, verifyEvidence });
        result.records.push({ work: dependency, ...checked });
        if (checked.status !== 'valid') add('prerequisite-unverified', `${dependency}: prerequisite checks did not pass.`, checked.status === 'invalid' ? 'invalid' : 'unavailable', checked.findings);
        for (const entry of bundle.evidence.filter((item) => item.record.pr)) {
          if (entry.record.record_type === 'initial-bootstrap-verification') continue;
          const pull = bundle.pulls.find((item) => entry.record.pr.toLowerCase() === `${trace.repository}#${item.number}`);
          if (!pull?.merged) continue;
          try {
            await trace.bindPolicyScope(pull);
            const policy = await resolveHistoricalPolicy({ adapter: trace.adapter, record: entry.record, runtime });
            result.policies.push(policy);
            if (policy.status !== 'available') add('prerequisite-policy-unavailable', `${dependency}: recorded policy could not be reconstructed.`, policy.status === 'invalid' ? 'invalid' : 'unavailable', policy.findings);
            else {
              const current = { ...policy.assessment, policy_ref: policy.policy_ref, contract_package: policy.contract_package,
                config_digest: policy.config_digest, activation_digest: policy.activation_digest };
              for (const finding of (hasReviewDeclarations(entry.record) ? checkReviewEvidence : checkEvidenceContext)({ record: entry.record, policy, current })) {
                if (finding.severity === 'review') result.findings.push({ ...finding, work: dependency });
                else add('prerequisite-review-invalid', `${dependency}: ${finding.message}`, 'invalid', finding);
              }
            }
          } catch (error) { acquisitionFailure(error); }
          finally { trace.resetScope(); }
        }
      }
      trace.resetScope();
    }
    for (const pull of selected.pulls.filter((item) => !item.merged)) {
      const pr = `${trace.repository}#${pull.number}`;
      const fresh = await trace.adapter.readPull(pr);
      if (!isDeepStrictEqual([pull.head.sha, pull.base.sha, pull.base.ref], [fresh.head?.sha, fresh.base?.sha, fresh.base?.ref])) add('assessment-context-stale', `${pr}: the PR head or destination changed during the check.`);
    }
    for (const finding of await trace.recheckWorkSources()) add(finding.code, finding.message);
    await trace.recheckAcquisition();
    result.context.acquisition = trace.acquisitionContext();
    for (const finding of trace.findings) {
      if (finding.severity === 'error') add(finding.code, finding.message, 'invalid', { source: finding.source, errors: finding.details });
      else if (finding.severity === 'unavailable') add(finding.code, finding.message, 'unavailable', { source: finding.source });
      else result.findings.push(finding);
    }
    result.findings.push({ code: 'formal-check-only', message: 'Formal checks do not grant merge permission, authenticate review independence or establish the full assigned outcome.' });
  } catch (error) {
    if (error.code === 'acquisition-context-stale' && error.details?.assessment) result.assessment ??= error.details.assessment;
    add(error.code || 'check-unavailable', error.message, 'unavailable', error.details);
  } finally {
    if (trace) {
      trace.resetScope();
      result.context ??= {};
      result.context.invalid_sources = trace.invalidSourceContext();
      result.context.acquisition = trace.acquisitionContext();
    }
  }
  return result;
}

export async function checkWork({ targetRoot, work, localOnly = false, deltaRef, manifestRef, runtime } = {}) {
  if (!localOnly) return liveCheck({ targetRoot, work, deltaRef, manifestRef, runtime });
  const { repository } = workIdentity(work);
  const adapter = await createReadAdapter({ targetRoot, repository, localOnly });
  const revision = await git(adapter.targetRoot, ['rev-parse', 'HEAD']);
  return {
    ...runtimeContext(runtime), operation: 'check', mode: 'local-only', status: 'incomplete', repository, work, revision,
    findings: [
      { code: 'github-skipped', message: 'GitHub records and live destination freshness were not read.' },
      { code: 'policy-unavailable', message: 'A local snapshot does not establish the actual PR destination or its governing policy.' },
    ],
  };
}
